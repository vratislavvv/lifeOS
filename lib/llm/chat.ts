import Anthropic from '@anthropic-ai/sdk';
import { getAI } from './client';

export type ChatMessage = { role: 'user' | 'lenna'; text: string };

type ChatContext = {
  userName: string;
  quarter: string;
  operatingLevel: number | null;
  vectorBreakdown: Record<string, number>;
  vectors: { id: string; label: string }[];
  goals: { vectorId: string; description: string }[];
  justLogged: { vectorId: string; summary: string; progressDelta: number } | null;
};

export type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: "Add a task to the user's today list",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Concise, actionable task title' },
      },
      required: ['title'],
    },
  },
  {
    name: 'log_progress',
    description: 'Log progress for a life vector on behalf of the user',
    input_schema: {
      type: 'object',
      properties: {
        vectorId:      { type: 'string', description: 'Vector ID (craft/body/money/mind/social/rest)' },
        description:   { type: 'string', description: 'What was done, 10 words max' },
        progressDelta: { type: 'number', description: 'Progress 0–1. Training session ≈ 0.1, major milestone ≈ 0.4' },
      },
      required: ['vectorId', 'description', 'progressDelta'],
    },
  },
];

export async function chatWithLenna(
  message: string,
  context: ChatContext,
  previousMessages: ChatMessage[],
  onToolCall?: ToolHandler
): Promise<string> {
  const vectorLines = context.vectors.map(v => {
    const gap = context.vectorBreakdown[v.id];
    const status = gap !== undefined
      ? (gap >= 0 ? `+${Math.round(gap * 100)}pp ahead` : `${Math.round(gap * 100)}pp behind`)
      : 'no data yet';
    const goal = context.goals.find(g => g.vectorId === v.id);
    return `- ${v.label}: ${status}${goal ? ` | goal: "${goal.description}"` : ''}`;
  }).join('\n');

  const system = `You are Lenna, personal assistant inside ${context.userName}'s life OS.

Quarter: ${context.quarter} | Operating level: ${context.operatingLevel !== null ? `${context.operatingLevel}/100` : 'not computed yet'}
${context.justLogged ? `\nJust logged under ${context.justLogged.vectorId}: "${context.justLogged.summary}" (+${Math.round(context.justLogged.progressDelta * 100)}pp)` : ''}

Vector pace gaps (positive = ahead of pace, negative = behind):
${vectorLines}

Be direct and concise — 2–3 sentences max. No sycophancy, no filler. Use tools when the user asks you to add a task or log progress on their behalf. If they logged something directly, acknowledge it and note the impact. Answer questions directly.`;

  const messages: Anthropic.MessageParam[] = [
    ...previousMessages.map(m => ({
      role: (m.role === 'lenna' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ];

  let response = await getAI().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system,
    messages,
    tools: TOOLS,
  });

  // Tool use loop
  while (response.stop_reason === 'tool_use' && onToolCall) {
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      const result = await onToolCall(toolUse.name, toolUse.input as Record<string, unknown>);
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await getAI().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system,
      messages,
      tools: TOOLS,
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text.trim() ?? '';
}
