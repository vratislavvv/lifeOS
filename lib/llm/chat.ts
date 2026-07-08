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
  goals: { id: string; vectorId: string; description: string; type: string; cadencePerWeek: number | null }[];
  goalSnapshots?: { id: string; vectorId: string; c: number; e: number }[];
  groups: { id: string; name: string; parentId: string | null }[];
  tasks: { id: string; title: string; done: boolean }[];
  upcomingTasks?: { id: string; title: string; dueDate: string; done: boolean }[];
  recentInputs?: { date: string; vectorId: string; description: string; kind: string; occurredCount: number | null; value: number | null }[];
  olTrend?: { date: string; ol: number }[];
  justLogged: { vectorId: string; summary: string; progressDelta: number } | null;
};

export type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'delete_task_group',
    description: 'Delete a task list or sublist and all its tasks. Use when the user asks to remove, delete, or get rid of a list.',
    input_schema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'ID of the group to delete' },
      },
      required: ['groupId'],
    },
  },
  {
    name: 'create_task_group',
    description: 'Create a new task list or sublist. Use parentId to nest it inside an existing list (e.g. a course inside "School").',
    input_schema: {
      type: 'object',
      properties: {
        name:     { type: 'string', description: 'Display name, e.g. "IB002" or "History"' },
        color:    { type: 'string', description: 'Optional hex color, e.g. "#7E6B8A"' },
        parentId: { type: 'string', description: 'ID of the parent list to nest this under. Omit for a top-level list.' },
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
        title:   { type: 'string', description: 'Concise, actionable task title' },
        groupId: { type: 'string', description: 'Task group ID. Omit to use the default Daily group.' },
        dueDate: { type: 'string', description: 'Optional due date in YYYY-MM-DD format' },
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
    name: 'edit_task',
    description: "Edit an existing task's title, priority flags, due date, or group. Only include the fields you want to change.",
    input_schema: {
      type: 'object',
      properties: {
        taskId:  { type: 'string', description: 'ID of the task to edit' },
        title:   { type: 'string', description: 'New title' },
        dueDate: { type: 'string', description: 'New due date YYYY-MM-DD, or empty string to clear' },
        groupId: { type: 'string', description: 'New group ID' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'log_progress',
    description: 'Log progress for a life vector. Use the kind that matches the goal type — the backend computes correct completion from the structured signal, not from progressDelta estimates.',
    input_schema: {
      type: 'object',
      properties: {
        vectorId:     { type: 'string', description: 'Vector ID' },
        goalId:       { type: 'string', description: 'Goal ID — always provide when the activity matches a specific goal' },
        description:  { type: 'string', description: 'What was done, 10 words max' },
        kind: {
          type: 'string',
          enum: ['milestone_delta', 'metric_value', 'consistency_occurrence'],
          description: 'milestone_delta: effort toward a milestone goal. metric_value: an observed numeric reading (e.g. savings balance). consistency_occurrence: one scheduled session completed.',
        },
        progressDelta: { type: 'number', description: 'For milestone_delta only: subjective progress −1..1. Minor effort ≈ 0.05, significant ≈ 0.2, major ≈ 0.3. Omit for other kinds.' },
        value:         { type: 'number', description: 'For metric_value only: the actual observed number (e.g. 12400 for €12,400 savings).' },
        occurredCount: { type: 'number', description: 'For consistency_occurrence only: number of sessions completed, usually 1.' },
      },
      required: ['vectorId', 'description', 'kind'],
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
    const vGoals = context.goals.filter(g => g.vectorId === v.id);
    const goalParts = vGoals.map(goal => {
      const snap = context.goalSnapshots?.find(s => s.id === goal.id);
      let part = `goal[${goal.id}]: "${goal.description}" (${goal.type}`;
      if (goal.type === 'consistency' && goal.cadencePerWeek != null) part += `, ${goal.cadencePerWeek}×/week, kind=consistency_occurrence`;
      if (goal.type === 'milestone') part += `, kind=milestone_delta`;
      if (goal.type === 'metric') part += `, kind=metric_value (snapshot) OR consistency_occurrence (if logging a session/event)`;
      if (snap) part += `, ${snap.c}% done / ${snap.e}% expected`;
      part += ')';
      return part;
    });
    return `- [${v.id}] ${v.label}: ${status}${goalParts.length ? ' | ' + goalParts.join('; ') : ''}`;
  }).join('\n');

  const groupLines = context.groups.map(g =>
    g.parentId
      ? `- ${g.id}: ${g.name} (sublist of ${g.parentId})`
      : `- ${g.id}: ${g.name}`
  ).join('\n');

  const pendingTasks = context.tasks.filter(t => !t.done);
  const taskLines = pendingTasks.length > 0
    ? pendingTasks.map(t => `- [${t.id}] ${t.title}`).join('\n')
    : '(none)';

  const upcomingTaskLines = context.upcomingTasks && context.upcomingTasks.length > 0
    ? context.upcomingTasks
        .filter(t => !t.done)
        .map(t => `- [${t.id}] ${t.title} (due ${t.dueDate})`)
        .join('\n') || '(none)'
    : '(none)';

  const activityLines = context.recentInputs && context.recentInputs.length > 0
    ? context.recentInputs.slice(0, 30).map(i => {
        const vec = context.vectors.find(v => v.id === i.vectorId)?.label ?? i.vectorId;
        const detail = i.kind === 'consistency_occurrence' ? `(${i.occurredCount ?? 1} session)`
          : i.kind === 'metric_value' ? `(value: ${i.value})`
          : '';
        return `- ${i.date} · ${vec}: ${i.description} ${detail}`.trim();
      }).join('\n')
    : '(none)';

  const olTrendLine = context.olTrend && context.olTrend.length > 0
    ? context.olTrend.map(s => `${s.date}: ${s.ol}`).join(', ')
    : 'no data';

  const tz = context.timezone || 'UTC';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const weekday = new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });

  const system = `You are Lenna, personal assistant inside ${context.userName}'s life OS.

Today is ${today} (${weekday}).

Quarter: ${context.quarter} | Operating level: ${context.operatingLevel !== null ? `${Math.round(context.operatingLevel)}/100` : 'not computed yet'}
OL trend (newest first): ${olTrendLine}
${context.justLogged ? `\nJust logged under ${context.justLogged.vectorId}: "${context.justLogged.summary}" (+${Math.round(context.justLogged.progressDelta * 100)}pp)` : ''}

Vectors — use EXACTLY these IDs in log_progress (positive gap = ahead of pace, negative = behind):
${vectorLines}

Task groups (use groupId when adding tasks):
${groupLines}

Today's pending tasks (use taskId when completing):
${taskLines}

Upcoming tasks with due dates:
${upcomingTaskLines}

Activity log — last 14 days (most recent first):
${activityLines}

OL trend (newest first): ${olTrendLine}

Rules:
- Be direct and concise — 2–3 sentences max. No sycophancy, no filler.
- NEVER claim you logged, added, ticked off, or completed something unless you have called the relevant tool in this exact response. Call all tools first, then confirm what was done in one short message.
- LOGGING: The moment the user mentions doing ANYTHING — workout, run, reading, work session, habit, saving money, social event, anything at all — call log_progress immediately. Do NOT ask for more info. Do NOT wait. Just infer the right vector from the list above (use the exact [id] shown), pick the goal's kind (shown as kind=... next to each goal), and call the tool. For consistency goals, use kind=consistency_occurrence and occurredCount=1. For milestone goals, use kind=milestone_delta with a progressDelta between 0.05 (minor) and 0.3 (major). For metric goals, use kind=metric_value with the value they mentioned. IMPORTANT EXCEPTION: if the user says they finished, shipped, completed, or achieved a milestone goal entirely (not just made progress — actually done), use progressDelta=1.0. This is the signal that marks the goal as 100% complete.
- When the user says they did everything / finished the day / completed their list, call log_progress for every activity they mentioned in the conversation that hasn't been logged yet, then confirm all in one message.
- When the user says they completed, finished, or did something that vaguely matches a pending task, do NOT silently complete it. Instead ask: "Was that the '[task title]' on your list? Should I tick it off?" Then call complete_task only once they confirm.
- When the user explicitly says to remove, tick off, or complete a task by name, call complete_task directly without asking.
- When the user asks to rename, change, update, or set a due date on a task, call edit_task with only the fields that change.
- When the user asks to add a task, call add_task. Infer importance and urgency from context.
- If progress was already logged (shown above as "Just logged"), acknowledge it briefly and note the score impact.
- Answer questions directly from the data above. Never say you don't have visibility into the activity log — you do.`;

  const messages: Anthropic.MessageParam[] = [
    ...previousMessages.map(m => ({
      role: (m.role === 'lenna' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ];

  let response = await getAI().messages.create({
    model: 'claude-sonnet-4-6',
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
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system,
      messages,
      tools: TOOLS,
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text.trim() ?? '';
}
