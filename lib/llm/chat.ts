import Anthropic from '@anthropic-ai/sdk';
import { getAI } from './client';

export type ChatMessage = { role: 'user' | 'lenna'; text: string };

type ChatContext = {
  userName: string;
  timezone: string;
  quarter: string;
  operatingLevel: number | null;
  vectorBreakdown: Record<string, number>;
  vectors: { id: string; label: string }[];
  goals: { vectorId: string; description: string }[];
  groups: { id: string; name: string }[];
  tasks: { id: string; title: string; done: boolean }[];
  justLogged: { vectorId: string; summary: string; progressDelta: number } | null;
};

export type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_task_group',
    description: 'Create a new task group so tasks can be organised under it',
    input_schema: {
      type: 'object',
      properties: {
        name:  { type: 'string', description: 'Display name for the group, e.g. "School"' },
        color: { type: 'string', description: 'Optional hex color, e.g. "#7E6B8A"' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_task',
    description: "Add a task to the user's today list",
    input_schema: {
      type: 'object',
      properties: {
        title:     { type: 'string',  description: 'Concise, actionable task title' },
        groupId:   { type: 'string',  description: 'Task group ID. Omit to use the default Daily group.' },
        important: { type: 'boolean', description: 'True if this task is important (high impact)' },
        urgent:    { type: 'boolean', description: 'True if this task must be done today or very soon' },
        dueDate:   { type: 'string',  description: 'Optional due date in YYYY-MM-DD format' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: "Mark a task as done in the user's today list",
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ID of the task to mark as done' },
      },
      required: ['taskId'],
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

  const groupLines = context.groups.map(g => `- ${g.id}: ${g.name}`).join('\n');

  const pendingTasks = context.tasks.filter(t => !t.done);
  const taskLines = pendingTasks.length > 0
    ? pendingTasks.map(t => `- [${t.id}] ${t.title}`).join('\n')
    : '(none)';

  const tz = context.timezone || 'UTC';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const weekday = new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });

  const system = `You are Lenna, personal assistant inside ${context.userName}'s life OS.

Today is ${today} (${weekday}).

Quarter: ${context.quarter} | Operating level: ${context.operatingLevel !== null ? `${context.operatingLevel}/100` : 'not computed yet'}
${context.justLogged ? `\nJust logged under ${context.justLogged.vectorId}: "${context.justLogged.summary}" (+${Math.round(context.justLogged.progressDelta * 100)}pp)` : ''}

Vector pace gaps (positive = ahead of pace, negative = behind):
${vectorLines}

Task groups (use groupId when adding tasks):
${groupLines}

Today's pending tasks (use taskId when completing):
${taskLines}

Rules:
- Be direct and concise — 2–3 sentences max. No sycophancy, no filler.
- When the user mentions ANYTHING they did or accomplished (workout, reading session, work done, habit completed, money saved, social event, anything), immediately call log_progress yourself — do NOT ask them to structure it. Infer the vector, description, and delta. Just do it.
- When the user says they completed, finished, or did something that vaguely matches a pending task, do NOT silently complete it. Instead ask: "Was that the '[task title]' on your list? Should I tick it off?" Then call complete_task only once they confirm.
- When the user explicitly says to remove, tick off, or complete a task by name, call complete_task directly without asking.
- When the user asks to add a task, call add_task. Infer importance and urgency from context.
- If progress was already logged (shown above as "Just logged"), acknowledge it briefly and note the score impact.
- Answer questions directly. Never ask the user to provide structured input — extract it yourself.`;

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
