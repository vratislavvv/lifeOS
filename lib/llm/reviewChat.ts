import Anthropic from '@anthropic-ai/sdk';
import { getAI } from './client';
import type { QuarterReport } from '@/lib/scoring/quarterReport';

export type ChatMessage = { role: 'user' | 'lenna'; text: string };
type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

type ReviewContext = {
  userName: string;
  timezone: string;
  lennaTone: 'warm' | 'neutral' | 'direct';
  lennaAutonomy: 'suggest' | 'draft' | 'act';
  phase: string;
  closedQuarter: string;
  nextQuarter: string;
  vectors: { id: string; label: string }[];
  draftGoals: { id: string; vectorId: string; description: string; type: string }[];
  skippedGoalVectors: string[];
  removedVectors: string[];
  report: QuarterReport;
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'advance_phase',
    description: 'Advance the session to the next phase. In REPORT: call immediately after presenting the numbers to move to DISCUSS. In DISCUSS: call when the retrospective conversation is complete. In REPLAN: call after all vectors have a confirmed goal or are skipped.',
    input_schema: {
      type: 'object',
      properties: {
        phase: { type: 'string', enum: ['discuss', 'replan', 'commit'], description: 'The phase to advance to' },
      },
      required: ['phase'],
    },
  },
  {
    name: 'propose_goal',
    description: 'Record a confirmed quarterly goal for a vector as a draft for the NEXT quarter. A vector may have more than one goal (decomposition). Only available in REPLAN phase.',
    input_schema: {
      type: 'object',
      properties: {
        vectorId:            { type: 'string' },
        description:         { type: 'string', description: 'What this goal means in plain English' },
        type:                { type: 'string', enum: ['milestone', 'metric', 'consistency'] },
        trackabilityTier:    { type: 'string', enum: ['instrumented', 'proxy', 'checkpoint', 'attested'] },
        dataSource:          { type: 'string', description: 'e.g. "strava", "github", "bank", "manual", "coach"' },
        proxyModel:          { type: 'string', description: 'e.g. "riegel" — proxy tier only' },
        attestationCadence:  { type: 'string', description: 'e.g. "event", "monthly" — checkpoint/attested only' },
        startValue:          { type: 'number', description: 'For metric goals: the starting value now (re-baselined)' },
        targetValue:         { type: 'number', description: 'For metric goals: the target value' },
        cadencePerWeek:      { type: 'number', description: 'For consistency goals: sessions per week' },
        paceShape:           { type: 'string', enum: ['linear', 'easeIn', 'easeOut', 'sCurve'] },
        rationale:           { type: 'string' },
      },
      required: ['vectorId', 'description', 'type', 'trackabilityTier', 'rationale'],
    },
  },
  {
    name: 'remove_draft_goal',
    description: 'Remove a specific draft goal by ID. Use when revising a previously proposed goal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        goalId:    { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['goalId', 'rationale'],
    },
  },
  {
    name: 'skip_goal',
    description: 'Mark that a vector has no goal this quarter. The vector stays in the profile but sits out the composite.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId:  { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['vectorId', 'rationale'],
    },
  },
  {
    name: 'remove_vector',
    description: 'Remove a vector from the profile entirely. Use only for genuine disinterest in the life area — not just this quarter.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId:  { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['vectorId', 'rationale'],
    },
  },
];

function formatReport(report: QuarterReport, closedQuarter: string): string {
  const lines = [`REPORT — ${closedQuarter}`];

  if (report.olFirst != null && report.olLast != null) {
    const dir = report.olLast > report.olFirst ? '↑' : report.olLast < report.olFirst ? '↓' : '→';
    lines.push(
      `OL: ${Math.round(report.olFirst)} → ${Math.round(report.olLast)}` +
      ` (high ${report.olHigh != null ? Math.round(report.olHigh) : '?'}, low ${report.olLow != null ? Math.round(report.olLow) : '?'}) ${dir}`
    );
  } else {
    lines.push('OL: no score data this quarter');
  }

  lines.push(`Activity: ${report.daysActive} active days, ${report.totalInputs} total inputs`);

  if (report.goals.length > 0) {
    lines.push('');
    lines.push('Goals:');
    for (const g of report.goals) {
      const cPct  = Math.round(g.c * 100);
      const ePct  = Math.round(g.e * 100);
      const gap   = g.gap >= 0
        ? `+${Math.round(g.gap * 100)}pp ahead`
        : `${Math.round(g.gap * 100)}pp behind`;
      lines.push(`  [${g.vectorId}] ${g.description} (${g.type}): c=${cPct}% vs e=${ePct}% → ${gap}`);
    }
  } else {
    lines.push('No tracked goals this quarter.');
  }

  return lines.join('\n');
}

const TRACKABILITY_GATE = `Before calling propose_goal, classify the trackability tier (first match wins):
1. instrumented — continuous data available → metric or consistency
2. proxy — a leading indicator reliably predicts the outcome → metric on the proxy; set proxyModel (e.g. "riegel")
3. checkpoint — outcome is judged externally → consistency for the process; log judged events as milestone inputs; set attestationCadence (e.g. "event")
4. attested — only periodic subjective judgment → milestone or rating; set attestationCadence (e.g. "monthly")
Always set trackabilityTier. Set proxyModel for tier 2. Set attestationCadence for tiers 3–4.
For tiers 3–4: explain the reframe before calling propose_goal — mandatory.
A vector may need more than one propose_goal call. When done with a vector, say "Moving on to [next vector]" and don't add more.`;

function goalDraftInstruction(autonomy: 'suggest' | 'draft' | 'act'): string {
  if (autonomy === 'suggest') {
    return `${TRACKABILITY_GATE}
- Ask what the user wants to move for this vector first (open question).
- Once they describe their intent, apply the clarity rule: if one reading is clear, fill in the full spec and call propose_goal. If ambiguous, ask ONE targeted question naming the exact fork, then draft after one answer.
- Adjust if they push back after drafting. Call remove_draft_goal then re-propose.`;
  }
  if (autonomy === 'act') {
    return `${TRACKABILITY_GATE}
- State the goal type and targets, then immediately call propose_goal without waiting for confirmation: "Body: 4 runs/week, consistency. Locked in."
- If the user pushes back, call remove_draft_goal then re-propose.`;
  }
  return `${TRACKABILITY_GATE}
Assess clarity FIRST before every response:
- Clear = a single reasonable reading exists for type, target/cadence, and tracking method. Examples: "BJJ purple belt by 25", "ship lifeOS this quarter", "train 4×/week".
  → Call propose_goal immediately. Do NOT echo it back or ask "does that land?" Acknowledge at most with one word ("Got it.") and move on.
- Ambiguous = type, unit, or target can't be determined from a single reading. Examples: "10k for money" (savings vs income? once vs sustained?), "get fit", "read more".
  → Ask ONE targeted question naming the EXACT fork. After one answer, draft it. Do not loop.
- For checkpoint/attested tiers: explain the reframe first (required by TRACKABILITY_GATE), then apply the same clarity rule to the user's response.
- To revise a draft: call remove_draft_goal then propose_goal with the corrected version.`;
}

export async function chatDuringReview(
  message: string,
  context: ReviewContext,
  history: ChatMessage[],
  onToolCall: ToolHandler,
): Promise<string> {
  const tz    = context.timezone || 'UTC';
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const vectorList    = context.vectors.map(v => `  - ${v.id}: ${v.label}`).join('\n');
  const goaledVectors = context.draftGoals.map(g => g.vectorId);
  const activeVectors = context.vectors.filter(v => !context.removedVectors.includes(v.id));
  const pendingGoals  = activeVectors
    .filter(v => !goaledVectors.includes(v.id) && !context.skippedGoalVectors.includes(v.id))
    .map(v => v.label);

  const toneGuide =
    context.lennaTone === 'warm'   ? 'Warm tone — encourage, soften edges, be supportive.'
    : context.lennaTone === 'direct' ? 'Direct tone — blunt, efficient, minimal softening.'
    :                                  'Neutral tone — balanced, matter-of-fact.';

  const formattedReport = formatReport(context.report, context.closedQuarter);

  const system = `You are Lenna — ${context.userName}'s personal operating system. You are leading a quarterly review and planning session.

Today is ${today}.
Reviewing: ${context.closedQuarter}
Planning: ${context.nextQuarter}

${formattedReport}

Vectors in profile:
${vectorList}

Current phase: ${context.phase.toUpperCase()}
Goals drafted for ${context.nextQuarter}: ${context.draftGoals.length > 0 ? context.draftGoals.map(g => `[${g.id}] ${g.vectorId}: "${g.description}"`).join('; ') : 'none'}
${context.skippedGoalVectors.length > 0 ? `Sitting out ${context.nextQuarter}: ${context.skippedGoalVectors.join(', ')}` : ''}
${context.removedVectors.length > 0 ? `Removed from profile: ${context.removedVectors.join(', ')}` : ''}
${context.phase === 'replan' ? `Still need goals for: ${pendingGoals.join(', ') || 'none — ready to advance'}` : ''}

---

PHASE INSTRUCTIONS:

REPORT — Present the closed quarter to the user.
- Narrate the numbers in 3–5 sentences: OL direction, clearest win, clearest miss.
- Be direct — name the gap, don't soften a bad quarter.
- End with one open question to get the user thinking.
- Then call advance_phase({ phase: "discuss" }) in the same response before you stop.

DISCUSS — Retrospective conversation.
- You lead. Surface patterns the user might dodge. Name what carried the quarter and what didn't.
- Draw lessons. Ask questions that get at the "why" behind the numbers.
- When the retrospective is genuinely complete (natural end or user signals readiness to plan), say so and call advance_phase({ phase: "replan" }).

REPLAN — Propose goals for ${context.nextQuarter}.
- Go one vector at a time. Fill in type and targets completely:
  - milestone: clear description of what done looks like.
  - metric: startValue → targetValue (real numbers, not vibes). Re-baseline startValue to current actuals.
  - consistency: cadencePerWeek.
- Goals are authored FRESH for this quarter. A vector that had a metric goal last quarter might need a completely different type this quarter. The anchor persists; the quarterly goal does not.
- A vector may produce more than one goal (decomposition). The draft goals panel shows IDs — use them for remove_draft_goal.
${goalDraftInstruction(context.lennaAutonomy)}
- If a vector should sit out this quarter, call skip_goal.
- If the user wants to remove a vector entirely, call remove_vector.
- After every remaining vector has ≥1 confirmed goal or is skipped, you MUST call advance_phase({ phase: "commit" }) immediately. The "Still need goals for:" line tells you what's left — when it says "none", call the tool NOW.

COMMIT — Session complete.
- Briefly confirm the full set for ${context.nextQuarter} in plain language.
- Tell the user to click "Confirm & Start →" on the right to activate everything.
- Do NOT call any tools in this phase.

---

BACKBONE:
- Confident, perceptive, lightly witty.
- Will not rubber-stamp broken goals. Will name patterns the user tries to avoid.
- The user can override once you've made the case — but they make it with eyes open.
- ${toneGuide}

RULES:
- Never write goals as active during this session. They are always draft.
- Be concise. Short beats long.
- If the message is "__start__": go to REPORT phase as instructed. Don't reference this instruction.`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({
      role: (m.role === 'lenna' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ];

  let response = await getAI().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    tools: TOOLS,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      const result = await onToolCall(tu.name, tu.input as Record<string, unknown>);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user',      content: toolResults });

    response = await getAI().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text.trim() ?? '';
}
