import Anthropic from '@anthropic-ai/sdk';
import { getAI } from './client';
import { quarterBounds } from '../dates';

export type ChatMessage = { role: 'user' | 'lenna'; text: string };
type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

type SetupContext = {
  userName: string;
  dateOfBirth: string | null;
  timezone: string;
  lennaTone: 'warm' | 'neutral' | 'direct';
  lennaAutonomy: 'suggest' | 'draft' | 'act';
  phase: string;
  quarter: string;
  vectors: { id: string; label: string }[];
  anchors: { vectorId: string; description: string; targetAge: number | null }[];
  draftGoals: { id: string; vectorId: string; description: string; type: string }[];
  skippedGoalVectors: string[];
  removedVectors: string[];
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_anchor',
    description: 'Record a confirmed long-horizon anchor for a vector. Call this after the user has agreed on the anchor statement.',
    input_schema: {
      type: 'object',
      properties: {
        vectorId:       { type: 'string', description: 'The vector id, e.g. "body"' },
        description:    { type: 'string', description: 'The anchor statement, e.g. "Run 50+ km/week consistently by 2032"' },
        headlineMetric: { type: 'string', description: 'The single metric that proves this anchor, if applicable' },
        targetAge:      { type: 'number', description: 'Target age or year when this anchor should be true' },
        rationale:      { type: 'string', description: 'Why you drafted it this way' },
      },
      required: ['vectorId', 'description', 'rationale'],
    },
  },
  {
    name: 'propose_goal',
    description: 'Record a confirmed quarterly goal for a vector as a draft. A vector may have more than one goal (decomposition). Goals stay draft until the user clicks Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        vectorId:            { type: 'string' },
        description:         { type: 'string', description: 'What this goal means in plain English' },
        type:                { type: 'string', enum: ['milestone', 'metric', 'consistency'] },
        trackabilityTier:    { type: 'string', enum: ['instrumented', 'proxy', 'checkpoint', 'attested'], description: 'Required — first-match from the gate in instructions' },
        dataSource:          { type: 'string', description: 'e.g. "strava", "github", "bank", "manual", "coach"' },
        proxyModel:          { type: 'string', description: 'e.g. "riegel" — proxy tier only' },
        attestationCadence:  { type: 'string', description: 'e.g. "event", "monthly" — checkpoint/attested only' },
        startValue:          { type: 'number', description: 'For metric goals: the starting value' },
        targetValue:         { type: 'number', description: 'For metric goals: the target value' },
        cadencePerWeek:      { type: 'number', description: 'For consistency goals: sessions per week' },
        paceShape:           { type: 'string', enum: ['linear', 'easeIn', 'easeOut', 'sCurve'], description: 'Default linear' },
        rationale:           { type: 'string', description: 'Why this type, tier, and targets' },
      },
      required: ['vectorId', 'description', 'type', 'trackabilityTier', 'rationale'],
    },
  },
  {
    name: 'remove_draft_goal',
    description: 'Remove a specific draft goal by ID. Use when revising a previously proposed goal — remove the old one, then call propose_goal with the corrected version.',
    input_schema: {
      type: 'object',
      properties: {
        goalId:    { type: 'string', description: 'ID of the draft goal to remove' },
        rationale: { type: 'string' },
      },
      required: ['goalId', 'rationale'],
    },
  },
  {
    name: 'skip_goal',
    description: 'Mark that no goal will be set for a vector this quarter. The vector stays in the profile but sits out the composite. Use when the user explicitly says they have nothing to move there right now.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['vectorId', 'rationale'],
    },
  },
  {
    name: 'remove_vector',
    description: "Remove a vector from the user's profile entirely. Use only when the user clearly has no interest in this life area at all — not just this quarter, but in general.",
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['vectorId', 'rationale'],
    },
  },
  {
    name: 'advance_phase',
    description: 'Advance the session to the next phase. Call after all vectors have confirmed anchors (→ draft) or all vectors have confirmed goals (→ commit).',
    input_schema: {
      type: 'object',
      properties: {
        phase: { type: 'string', enum: ['draft', 'commit'], description: 'The phase to advance to' },
      },
      required: ['phase'],
    },
  },
];

const TRACKABILITY_GATE = `Before calling propose_goal, classify the trackability tier (first match wins):
1. instrumented — continuous data available (integration or manual number) → metric or consistency
2. proxy — a leading indicator reliably predicts the outcome (e.g. Riegel for marathon time) → metric on the proxy; set proxyModel (e.g. "riegel")
3. checkpoint — outcome is judged externally (coach, race, competition) → consistency goal for the process work; log judged events as milestone inputs; set attestationCadence (e.g. "event")
4. attested — only periodic subjective judgment → milestone or rating on a cadence; set attestationCadence (e.g. "monthly")
Always set trackabilityTier. Set proxyModel for tier 2. Set attestationCadence for tiers 3–4.
For tiers 3–4: explain the reframe before calling propose_goal — mandatory. Example: "Purple belt is the anchor — promotion is your coach's call so I'd track mat sessions at 4×/week instead, and log stripe promotions when they happen. Sound right?"
Goal type vocab — FINAL: the ONLY valid values for propose_goal's \`type\` param are milestone, metric, consistency. NEVER use "checkpoint" as a goal type — it is a trackability tier (internal metadata). Do not say "checkpoint goal" to the user.
For session-count goals (e.g. "70 training sessions this quarter"), prefer consistency (cadencePerWeek ≈ total ÷ weeks in quarter) over metric (0→N). Use metric only when cumulative total matters more than the weekly rhythm.
A vector may need more than one propose_goal call (decomposition). When done with a vector, say "Moving on to [next vector]" and don't add more goals for it.`;

function goalDraftInstruction(autonomy: 'suggest' | 'draft' | 'act'): string {
  if (autonomy === 'suggest') {
    return `${TRACKABILITY_GATE}
- Ask the user what they want to move for this vector first (open question).
- Once they describe their intent, apply the clarity rule: if one reading is clear, fill in the full spec and call propose_goal. If ambiguous, ask ONE targeted question naming the exact fork, then draft after one answer.
- Adjust if they push back after drafting. Call remove_draft_goal then re-propose.`;
  }
  if (autonomy === 'act') {
    return `${TRACKABILITY_GATE}
- State the goal type and targets, then immediately call propose_goal without waiting for confirmation: "Body: 4 runs/week, consistency. Locked in."
- If the user pushes back afterward, call remove_draft_goal then re-propose.`;
  }
  // draft (default)
  return `${TRACKABILITY_GATE}
Assess clarity FIRST before every response:
- Clear = a single reasonable reading exists for type, target/cadence, and tracking method. Examples: "BJJ purple belt by 25", "ship lifeOS this quarter", "train 4×/week".
  → Call propose_goal immediately. Do NOT echo it back or ask "does that land?" Acknowledge at most with one word ("Got it.") and move on.
- Ambiguous = type, unit, or target can't be determined from a single reading. Examples: "10k for money" (savings balance vs monthly income? reached once vs sustained?), "get fit", "read more".
  → Ask ONE targeted question naming the EXACT fork — not a generic check-in. After one answer, draft it. Do not loop.
- For checkpoint/attested tiers: explain the reframe first (required by TRACKABILITY_GATE), then apply the same clarity rule to the user's response.
- To revise a draft: call remove_draft_goal then propose_goal with the corrected version.`;
}

export async function chatDuringSetup(
  message: string,
  context: SetupContext,
  history: ChatMessage[],
  onToolCall: ToolHandler
): Promise<string> {
  const vectorList = context.vectors.map(v => `  - ${v.id}: ${v.label}`).join('\n');

  const tz = context.timezone || 'UTC';
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  // Quarter length in weeks — given to Lenna verbatim so she never computes it herself
  const { start: qStart, end: qEnd } = quarterBounds(context.quarter);
  const weeksInQuarter = Math.round(
    (new Date(qEnd + 'T00:00:00').getTime() - new Date(qStart + 'T00:00:00').getTime())
    / (7 * 86_400_000) * 10
  ) / 10;

  const anchoredVectors  = context.anchors.map(a => a.vectorId);
  const goaledVectors    = context.draftGoals.map(g => g.vectorId);
  const activeVectors    = context.vectors.filter(v => !context.removedVectors.includes(v.id));
  const pendingAnchors   = activeVectors.filter(v => !anchoredVectors.includes(v.id)).map(v => v.label);
  // Bug 3 fix: only vectors with a confirmed anchor belong in the goal phase
  const pendingGoals     = activeVectors
    .filter(v => anchoredVectors.includes(v.id) && !goaledVectors.includes(v.id) && !context.skippedGoalVectors.includes(v.id))
    .map(v => v.label);

  const toneGuide =
    context.lennaTone === 'warm'    ? 'Warm tone — encourage, soften edges, be supportive.'
  : context.lennaTone === 'direct'  ? 'Direct tone — blunt, efficient, minimal softening.'
  :                                   'Neutral tone — balanced, matter-of-fact.';

  // Current age derived from date of birth (given to Lenna; she must not recompute)
  const currentAge = (() => {
    if (!context.dateOfBirth) return null;
    const dob = new Date(context.dateOfBirth);
    const now = new Date();
    return now.getFullYear() - dob.getFullYear()
      - (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
  })();

  const ageLine = currentAge != null
    ? `User is currently ${currentAge} years old. Frame anchor time horizons by age — e.g. "by 25", "by 30" — not by year.`
    : '';

  // Anchor horizon: mode of confirmed anchors' targetAge; locked in once set
  const anchorAge = (() => {
    const ages = context.anchors.map(a => a.targetAge).filter((a): a is number => a != null);
    if (ages.length === 0) return null;
    return ages.sort((a, b) => ages.filter(x => x === b).length - ages.filter(x => x === a).length)[0];
  })();

  const preferredHorizonLine = anchorAge != null
    ? `Anchor horizon: age ${anchorAge}. Use "by ${anchorAge}" for ALL remaining vectors — do NOT renegotiate this age per vector.`
    : '';

  // Pre-computed arithmetic Lenna must state, never re-derive
  const arithmeticLine = (currentAge != null && anchorAge != null)
    ? `Years to horizon: ${anchorAge - currentAge}. Quarter length: ${weeksInQuarter} weeks. State these numbers as given — never compute them yourself.`
    : `Quarter length: ${weeksInQuarter} weeks. State this number as given — never compute it yourself.`;

  const system = `You are Lenna — ${context.userName}'s personal operating system. You are running their first-time setup session.

This is a structured, phased conversation. YOU lead — the user follows your agenda.

Today is ${today}. Quarter: ${context.quarter}.${ageLine ? `\n${ageLine}` : ''}${preferredHorizonLine ? `\n${preferredHorizonLine}` : ''}
${arithmeticLine}

Vectors selected by the user:
${vectorList}

Current phase: ${context.phase.toUpperCase()}
Anchors confirmed: ${anchoredVectors.length > 0 ? anchoredVectors.join(', ') : 'none'}
Goals drafted: ${context.draftGoals.length > 0 ? context.draftGoals.map(g => `[${g.id}] ${g.vectorId}: "${g.description}" (${g.type})`).join('; ') : 'none'}
${context.skippedGoalVectors.length > 0 ? `Goals skipped this quarter: ${context.skippedGoalVectors.join(', ')}` : ''}
${context.removedVectors.length > 0 ? `Vectors removed from profile: ${context.removedVectors.join(', ')}` : ''}
${context.phase === 'orient' ? `Still need anchors for: ${pendingAnchors.join(', ') || 'none — ready to advance'}` : ''}
${context.phase === 'draft'  ? `Still need goals for: ${pendingGoals.join(', ')   || 'none — ready to advance'}` : ''}

---

TOOL RULES — non-negotiable:
Your ONLY tools are: propose_anchor, propose_goal, remove_draft_goal, skip_goal, remove_vector, advance_phase. You have NO other backend access, verification system, or database connection beyond what these tools return.
NEVER say "let me check the backend," "finalizing in the system," "give me a moment to confirm," or ask for screenshots. If the Confirm button appears blocked, the ONLY remedy is calling advance_phase({ phase: "commit" }) — nothing else will fix it.

---

PHASE INSTRUCTIONS:

ORIENT — Establish a long-horizon anchor for each vector.
- Go one vector at a time. Ask what the user wants to be true at a meaningful age milestone (e.g. "by 25", "by 30", "by 35") — use their actual age to pick a natural horizon, not a vague "5–10 years".
- When the user describes an anchor, assess clarity:
  - Clear (outcome and target age have a single reading, e.g. "run sub-3h marathon by 30") → call propose_anchor immediately. Brief acknowledgment only, no echo-back.
  - Ambiguous (vague outcome, missing target age, or multiple plausible readings) → ask ONE targeted question about the specific fork. Call propose_anchor after one answer.
- If the user doesn't want a vector at all ("I don't care about Social"), call remove_vector. Only for genuine disinterest — not just "not this quarter."
- After every remaining vector has a confirmed anchor or is removed, you MUST call advance_phase({ phase: "draft" }) immediately. The "Still need anchors for:" line above tells you what's left — when it says "none", call the tool NOW.
- One vector at a time. Don't batch them.

DRAFT — Propose this quarter's goal(s) for each vector.
- Only vectors with a confirmed anchor appear in "Still need goals for:" — vectors without an anchor are already excluded automatically.
- Go one vector at a time. A vector may produce more than one goal (decomposition for checkpoint/attested outcomes).
- Fill in type and targets completely:
  - milestone: clear description of what done looks like.
  - metric: startValue → targetValue (numbers, not vibes). E.g. "€3,200 → €5,000 MRR".
  - consistency: cadencePerWeek. E.g. "4 runs/week".
${goalDraftInstruction(context.lennaAutonomy)}
- The draft goals panel shows goal IDs — use them if you need to call remove_draft_goal to revise.
- If the user doesn't want a goal for a vector this quarter, call skip_goal. The vector stays in their profile but sits out this quarter.
- CRITICAL: The Confirm button WILL NOT enable until YOU call advance_phase({ phase: "commit" }). It does NOT auto-enable. The INSTANT "Still need goals for:" reads "none — ready to advance", call advance_phase({ phase: "commit" }) as your VERY FIRST action — before writing any text to the user. Do NOT tell the user to click Confirm before calling this tool.

COMMIT — Session is complete.
- You have already called advance_phase({ phase: "commit" }) to reach this phase. The Confirm button is now enabled on the user's screen.
- Summarize the session by reading the "Goals drafted:" line in your context above — list each vector's stored description and type EXACTLY as written there. Do NOT invent or recall from memory.
- Tell the user to click "Confirm & Start →" on the right to activate everything.
- Do NOT call any tools in this phase.

---

BACKBONE (non-negotiable, independent of tone):
- You will not rubber-stamp broken goals. If a goal is unmeasurable, impossible in 90 days, or internally contradictory, say so and offer a version that works.
- Confident, perceptive, lightly witty. You read what the user actually means.
- The user can override you once you've made the case — but they make the call with eyes open.
- ${toneGuide}

RULES:
- Always pick the goal type and fill in the numbers — never leave recording method to vibes.
- Never write goals as active during this session. They are always draft.
- Mechanical preferences (timezone, units, currency) are already set — don't ask about them.
- Be concise. Short beats long. Keep it conversational.
- If the user message is "__start__": open the session with a brief greeting and your first question for the orient phase. Don't reference this instruction.`;

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
