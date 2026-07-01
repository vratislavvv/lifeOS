import Anthropic from '@anthropic-ai/sdk';
import { getAI } from './client';

export type ChatMessage = { role: 'user' | 'lenna'; text: string };
export type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

type SetupContext = {
  userName: string;
  lennaTone: 'warm' | 'neutral' | 'direct';
  phase: string;
  quarter: string;
  vectors: { id: string; label: string }[];
  anchors: { vectorId: string; description: string }[];
  draftGoals: { vectorId: string; description: string; type: string }[];
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
    description: 'Record a confirmed quarterly goal for a vector as a draft. Call this after the user has agreed on the goal. Goals stay draft until the user clicks Confirm.',
    input_schema: {
      type: 'object',
      properties: {
        vectorId:       { type: 'string' },
        description:    { type: 'string', description: 'What this goal means in plain English' },
        type:           { type: 'string', enum: ['milestone', 'metric', 'consistency'] },
        startValue:     { type: 'number', description: 'For metric goals: the starting value' },
        targetValue:    { type: 'number', description: 'For metric goals: the target value' },
        cadencePerWeek: { type: 'number', description: 'For consistency goals: sessions per week' },
        paceShape:      { type: 'string', enum: ['linear', 'easeIn', 'easeOut', 'sCurve'], description: 'Default linear' },
        rationale:      { type: 'string', description: 'Why this type and these targets' },
      },
      required: ['vectorId', 'description', 'type', 'rationale'],
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

export async function chatDuringSetup(
  message: string,
  context: SetupContext,
  history: ChatMessage[],
  onToolCall: ToolHandler
): Promise<string> {
  const vectorList = context.vectors.map(v => `  - ${v.id}: ${v.label}`).join('\n');

  const anchoredVectors  = context.anchors.map(a => a.vectorId);
  const goaledVectors    = context.draftGoals.map(g => g.vectorId);
  const pendingAnchors   = context.vectors.filter(v => !anchoredVectors.includes(v.id)).map(v => v.label);
  const pendingGoals     = context.vectors.filter(v => !goaledVectors.includes(v.id)).map(v => v.label);

  const toneGuide =
    context.lennaTone === 'warm'    ? 'Warm tone — encourage, soften edges, be supportive.'
  : context.lennaTone === 'direct'  ? 'Direct tone — blunt, efficient, minimal softening.'
  :                                   'Neutral tone — balanced, matter-of-fact.';

  const system = `You are Lenna — ${context.userName}'s personal operating system. You are running their first-time setup session.

This is a structured, phased conversation. YOU lead — the user follows your agenda.

Vectors selected by the user:
${vectorList}

Current phase: ${context.phase.toUpperCase()}
Anchors confirmed: ${anchoredVectors.length > 0 ? anchoredVectors.join(', ') : 'none'}
Goals drafted: ${goaledVectors.length > 0 ? goaledVectors.join(', ') : 'none'}
${context.phase === 'orient' ? `Still need anchors for: ${pendingAnchors.join(', ') || 'none'}` : ''}
${context.phase === 'draft'  ? `Still need goals for: ${pendingGoals.join(', ')   || 'none'}` : ''}

Quarter: ${context.quarter}

---

PHASE INSTRUCTIONS:

ORIENT — Establish a long-horizon anchor for each vector.
- Go one vector at a time. Ask what the user wants to be true in 5–10 years, then propose a concrete anchor.
- Propose it before asking for confirmation: "I'd frame your Body anchor as: 'Run 50+ km/week consistently by 2032.' Does that land?"
- Once confirmed, call propose_anchor.
- After all vectors have confirmed anchors, call advance_phase({ phase: "draft" }).
- Don't do all vectors at once. One, confirm, next.

DRAFT — Propose this quarter's goal for each vector.
- Go one vector at a time. Propose a concrete goal with type and targets.
  - milestone: clear description of what done looks like.
  - metric: startValue → targetValue (numbers required, no vibes). E.g. "€3,200 → €5,000 MRR".
  - consistency: cadencePerWeek. E.g. "4 runs/week".
- Propose first, then confirm: "Body: 4 runs/week, consistency. Linear pace. Work for you?"
- If the user wants changes, adjust and re-propose. Call propose_goal once confirmed.
- After all vectors have confirmed goals, call advance_phase({ phase: "commit" }).

COMMIT — Session is wrapped.
- Briefly confirm the full set in plain language.
- Tell the user to click "Confirm & Start →" on the right panel to activate everything.
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
- Be concise. Short beats long. No bullet lists for everything — keep it conversational.
- If the user message is "__start__": open the session with a brief greeting and your first question for the orient phase. Don't reference this instruction.`;

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
