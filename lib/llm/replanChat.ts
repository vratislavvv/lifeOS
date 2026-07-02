import Anthropic from '@anthropic-ai/sdk';
import { getAI } from './client';

export type ChatMessage = { role: 'user' | 'lenna'; text: string };
export type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

type ReplanContext = {
  userName: string;
  timezone: string;
  lennaTone: 'warm' | 'neutral' | 'direct';
  lennaAutonomy: 'suggest' | 'draft' | 'act';
  phase: string;
  currentQuarter: string;
  vectors: { id: string; label: string }[];
  currentGoals: { id: string; vectorId: string; description: string; type: string }[];
  draftGoals: { vectorId: string; description: string; type: string }[];
  abandonedGoalIds: string[];
  skippedGoalVectors: string[];
  removedVectors: string[];
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'advance_phase',
    description: 'Advance the session to the next phase. In DISCUSS: call when you have a clear picture of what needs changing. In REPLAN: call after all requested changes are addressed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phase: { type: 'string', enum: ['replan', 'commit'], description: 'Phase to advance to' },
      },
      required: ['phase'],
    },
  },
  {
    name: 'abandon_goal',
    description: 'Mark an existing active goal as abandoned. The goal is removed from scoring immediately. Use before proposing a replacement, or alone if the user wants to drop it entirely.',
    input_schema: {
      type: 'object' as const,
      properties: {
        goalId:    { type: 'string', description: 'ID of the active goal to abandon' },
        rationale: { type: 'string' },
      },
      required: ['goalId', 'rationale'],
    },
  },
  {
    name: 'propose_goal',
    description: 'Record a new replacement goal for the current quarter. The goal window starts today (mid-quarter). Call after the user agrees on the replacement.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId:       { type: 'string' },
        description:    { type: 'string', description: 'What this goal means in plain English' },
        type:           { type: 'string', enum: ['milestone', 'metric', 'consistency'] },
        startValue:     { type: 'number', description: 'For metric goals: current value now' },
        targetValue:    { type: 'number', description: 'For metric goals: target value' },
        cadencePerWeek: { type: 'number', description: 'For consistency goals: sessions per week' },
        paceShape:      { type: 'string', enum: ['linear', 'easeIn', 'easeOut', 'sCurve'] },
        rationale:      { type: 'string' },
      },
      required: ['vectorId', 'description', 'type', 'rationale'],
    },
  },
  {
    name: 'skip_goal',
    description: 'Mark that a vector has no goal for the rest of this quarter. The vector stays in the profile but sits out the composite.',
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
    description: 'Remove a vector from the profile entirely. Use only for genuine disinterest in the life area — not just a quarter-level pause.',
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

function goalDraftInstruction(autonomy: 'suggest' | 'draft' | 'act'): string {
  if (autonomy === 'suggest') {
    return `- Ask what the user wants for the replacement before proposing: "What should the new [vector] goal look like?" Once they describe it, fill in the full spec and confirm: "So: 3 runs/week, consistency for the rest of the quarter. That right?"
- Adjust if they push back. Call propose_goal only after they confirm.`;
  }
  if (autonomy === 'act') {
    return `- State the replacement goal type and targets, then immediately call propose_goal without waiting for confirmation: "Replacing with 3 runs/week for the rest of the quarter. Done."
- If the user pushes back afterward, call the appropriate correction.`;
  }
  return `- Propose first, confirm: "Body: dropping 5×/week — replace with 3×/week for the remaining weeks? That's more achievable."
- If the user wants changes, adjust and re-propose. Call propose_goal once confirmed.`;
}

export async function chatDuringReplan(
  message: string,
  context: ReplanContext,
  history: ChatMessage[],
  onToolCall: ToolHandler,
): Promise<string> {
  const tz    = context.timezone || 'UTC';
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const toneGuide =
    context.lennaTone === 'warm'   ? 'Warm tone — encourage, soften edges, be supportive.'
    : context.lennaTone === 'direct' ? 'Direct tone — blunt, efficient, minimal softening.'
    :                                  'Neutral tone — balanced, matter-of-fact.';

  const activeGoalLines = context.currentGoals
    .filter(g => !context.abandonedGoalIds.includes(g.id))
    .map(g => `  [${g.id}] ${g.vectorId}: "${g.description}" (${g.type})`)
    .join('\n') || '  none';

  const abandonedLines = context.abandonedGoalIds.length > 0
    ? '\nGoals being abandoned:\n' +
      context.currentGoals
        .filter(g => context.abandonedGoalIds.includes(g.id))
        .map(g => `  [${g.id}] ${g.vectorId}: "${g.description}"`)
        .join('\n')
    : '';

  const draftLines = context.draftGoals.length > 0
    ? '\nNew goals drafted:\n' +
      context.draftGoals.map(g => `  [new] ${g.vectorId}: "${g.description}" (${g.type})`).join('\n')
    : '';

  const vectorList = context.vectors
    .filter(v => !context.removedVectors.includes(v.id))
    .map(v => `  - ${v.id}: ${v.label}`)
    .join('\n');

  const system = `You are Lenna — ${context.userName}'s personal operating system. You are leading an on-demand mid-quarter replan session.

Today is ${today}.
Current quarter: ${context.currentQuarter}

Active goals right now:
${activeGoalLines}
${abandonedLines}
${draftLines}
${context.skippedGoalVectors.length > 0 ? `\nSitting out rest of quarter: ${context.skippedGoalVectors.join(', ')}` : ''}

Vectors in profile:
${vectorList}

Current phase: ${context.phase.toUpperCase()}

---

PHASE INSTRUCTIONS:

DISCUSS — Something has changed mid-quarter and they need to revise.
- Open with: "What's changed? What do you want to revise this quarter?" — then listen.
- Understand which goals need dropping, replacing, or creating.
- Keep it tight — 2–3 exchanges to understand the situation.
- When you have a clear picture of what needs changing, call advance_phase({ phase: "replan" }).

REPLAN — Execute the specific changes the user described.
- Work through each vector that needs a change, one at a time.
- To replace a goal: call abandon_goal (use its ID from the active goals list), then propose a concrete replacement, then call propose_goal.
- To drop without replacing: call abandon_goal, then skip_goal.
- Leave vectors the user didn't mention completely alone.
- Goals are authored FRESH for the remaining quarter window — different type allowed.
  - milestone: clear description of what done looks like.
  - metric: startValue → targetValue (re-baseline to current actuals today).
  - consistency: cadencePerWeek. Note: the quarter window is shorter — calibrate cadence realistically.
${goalDraftInstruction(context.lennaAutonomy)}
- After ALL requested changes are addressed, call advance_phase({ phase: "commit" }) immediately.

COMMIT — Replan complete.
- Briefly confirm what changed (2–3 sentences).
- Tell the user to click "Confirm changes →" on the right to activate.
- Do NOT call any tools.

---

BACKBONE:
- Confident, perceptive, lightly witty.
- Will not rubber-stamp broken goals. Names patterns the user tries to avoid.
- The user can override once you've made the case.
- ${toneGuide}

RULES:
- Be concise. Short beats long.
- New goals are always draft until the user clicks confirm — never say they're active yet.
- If the message is "__start__": open the DISCUSS phase as instructed. Don't reference this instruction.`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({
      role: (m.role === 'lenna' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ];

  let response = await getAI().messages.create({
    model: 'claude-haiku-4-5-20251001',
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text.trim() ?? '';
}
