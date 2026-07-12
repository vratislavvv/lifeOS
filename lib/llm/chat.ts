import Anthropic from '@anthropic-ai/sdk';
import { getAI } from './client';

export type ChatMessage = { role: 'user' | 'lenna'; text: string };

type ChatContext = {
  userName: string;
  timezone: string;
  quarter: string;
  operatingLevel: number | null;
  vectorBreakdown: Record<string, number>;
  vectors: { id: string; label: string; active: boolean }[];
  anchors?: { vectorId: string; description: string; targetAge: number | null }[];
  goals: { id: string; vectorId: string; description: string; type: string; cadencePerWeek: number | null }[];
  goalSnapshots?: { id: string; vectorId: string; c: number; e: number }[];
  groups: { id: string; name: string; parentId: string | null }[];
  tasks: { id: string; title: string; done: boolean }[];
  upcomingTasks?: { id: string; title: string; dueDate: string; done: boolean }[];
  recentInputs?: { id: string; date: string; vectorId: string; description: string; kind: string; occurredCount: number | null; value: number | null }[];
  olTrend?: { date: string; ol: number }[];
  justLogged: { vectorId: string; summary: string; progressDelta: number } | null;
};

type ToolHandler = (name: string, input: Record<string, unknown>) => Promise<string>;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'edit_anchor',
    description: 'Replace the long-term anchor for a vector. Deletes all existing anchors for that vector and writes a single new one. Use when the user wants to change, correct, or consolidate a duplicate anchor.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId:       { type: 'string' },
        description:    { type: 'string', description: "The long-term vision in the user's own words" },
        headlineMetric: { type: 'string', description: 'Optional measurable indicator' },
        targetAge:      { type: 'number', description: "The user's age at which they aim to reach the anchor" },
      },
      required: ['vectorId', 'description'],
    },
  },
  {
    name: 'propose_anchor',
    description: 'Record the long-term anchor for a vector (its durable destination). Only call during an add-vector flow, after create_vector. Replaces any existing anchor for the vector.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId:       { type: 'string' },
        description:    { type: 'string', description: "The long-term vision in the user's own words" },
        headlineMetric: { type: 'string', description: 'Optional measurable indicator, e.g. "bench press 120 kg"' },
        targetAge:      { type: 'number', description: "The user's age at which they aim to reach the anchor" },
        rationale:      { type: 'string' },
      },
      required: ['vectorId', 'description', 'rationale'],
    },
  },
  {
    name: 'propose_goal',
    description: 'Create a DRAFT quarterly goal for a vector during an add-vector flow. Call after propose_anchor. The goal stays draft until the user confirms and you call activate_vector_goal. Use remove_draft_goal to revise.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId:           { type: 'string' },
        description:        { type: 'string', description: 'What this goal means in plain English' },
        type:               { type: 'string', enum: ['milestone', 'metric', 'consistency'] },
        trackabilityTier:   { type: 'string', enum: ['instrumented', 'proxy', 'checkpoint', 'attested'] },
        dataSource:         { type: 'string', description: 'e.g. "strava", "github", "bank", "manual", "coach"' },
        proxyModel:         { type: 'string', description: 'e.g. "riegel" — proxy tier only' },
        attestationCadence: { type: 'string', description: 'e.g. "event", "monthly" — checkpoint/attested only' },
        startValue:         { type: 'number', description: 'Current starting value (for metric goals)' },
        targetValue:        { type: 'number', description: 'Target value (for metric goals)' },
        cadencePerWeek:     { type: 'number', description: 'Sessions per week (for consistency goals)' },
        paceShape:          { type: 'string', enum: ['linear', 'easeIn', 'easeOut', 'sCurve'] },
        rationale:          { type: 'string' },
      },
      required: ['vectorId', 'description', 'type', 'trackabilityTier', 'rationale'],
    },
  },
  {
    name: 'remove_draft_goal',
    description: 'Remove a draft goal by ID. Use to revise a previously proposed goal (then call propose_goal again with the correction).',
    input_schema: {
      type: 'object' as const,
      properties: {
        goalId:    { type: 'string', description: 'The ID returned by the propose_goal tool call' },
        rationale: { type: 'string' },
      },
      required: ['goalId', 'rationale'],
    },
  },
  {
    name: 'activate_vector_goal',
    description: 'Final step in the add-vector flow. Activates all draft goals for a vector after the user confirms. Sets startDate = today. Only call when user has explicitly confirmed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vectorId: { type: 'string' },
      },
      required: ['vectorId'],
    },
  },
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
    description: "Edit an existing task's title, due date, or group. Only include the fields you want to change.",
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
    name: 'create_vector',
    description: 'Create a new life vector (an area/direction like "Fatherhood" or "Adventure"). Guard: if what the user describes is an achievement or outcome ("run a marathon", "get promoted", "learn piano"), do NOT create a vector — reframe it as an anchor or goal under an existing vector and explain why.',
    input_schema: {
      type: 'object',
      properties: {
        label:       { type: 'string', description: 'Display name, e.g. "Fatherhood"' },
        color:       { type: 'string', description: 'Hex color. Pick from the palette: #B0853F (amber), #7E8A6B (sage), #6B7E8A (steel), #7E6B8A (purple), #8A6B7E (rose), #8A7E6B (tan), #6B8A7E (teal)' },
        description: { type: 'string', description: 'One-line description of what this area means for this user' },
      },
      required: ['label', 'color'],
    },
  },
  {
    name: 'edit_vector',
    description: "Edit an existing vector's label, color, description, order, weight, or active status. Use active: true to reactivate an archived vector (it will then need a fresh anchor/goal via the add-vector flow).",
    input_schema: {
      type: 'object',
      properties: {
        vectorId:    { type: 'string', description: 'ID of the vector to edit' },
        label:       { type: 'string', description: 'New display name' },
        color:       { type: 'string', description: 'New hex color' },
        description: { type: 'string', description: 'New description' },
        order:       { type: 'number', description: 'New sort order (0-based integer)' },
        weight:      { type: 'number', description: 'Scoring weight — default 1. Higher weight makes this vector count more in the operating level.' },
        active:      { type: 'boolean', description: 'Set true to reactivate an archived vector. After reactivation, run the add-vector flow to set a fresh anchor and goal.' },
      },
      required: ['vectorId'],
    },
  },
  {
    name: 'archive_vector',
    description: 'Archive a vector — marks it inactive and closes its active goals. Use when the user wants to stop tracking a life area that has history. Preserves all history. Never use this on a vector the user wants to simply rename or temporarily skip.',
    input_schema: {
      type: 'object',
      properties: {
        vectorId: { type: 'string', description: 'ID of the vector to archive' },
      },
      required: ['vectorId'],
    },
  },
  {
    name: 'delete_input',
    description: 'Delete one or more logged progress entries. Pass a single ID or multiple IDs to bulk-delete. Use when the user asks to remove, undo, or delete entries from the activity log.',
    input_schema: {
      type: 'object',
      properties: {
        inputIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of the input entries to delete (shown in brackets in the activity log). Pass all IDs in one call.',
        },
      },
      required: ['inputIds'],
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task. Use when the user asks to remove or delete a task (not just complete it).',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task to delete' },
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
    if (!v.active) return `- [${v.id}] ${v.label}: ARCHIVED`;
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
    const anchor = context.anchors?.find(a => a.vectorId === v.id);
    const anchorPart = anchor
      ? ` | anchor: "${anchor.description}"${anchor.targetAge != null ? ` (by age ${anchor.targetAge})` : ''}`
      : '';
    return `- [${v.id}] ${v.label}: ${status}${anchorPart}${goalParts.length ? ' | ' + goalParts.join('; ') : ''}`;
  }).join('\n');

  const activeVectorCount = context.vectors.filter(v => v.active).length;

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
        return `- [${i.id}] ${i.date} · ${vec}: ${i.description} ${detail}`.trim();
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
- VECTORS — create: a vector is a durable life area/direction (Craft, Body, Fatherhood, Faith). It is NOT a goal or task. If the user says "I want to track running a marathon" or "add learning piano as a vector", do NOT create a vector — tell them it's a goal/anchor under an existing vector, and offer to file it there. Only create a vector when it's genuinely a new life direction. Active vectors are capped at 6 — if already at 6, push back: "that's ${activeVectorCount} active directions, which starts to fragment your focus — want to archive one first?" User can override once you've made the case.
- VECTORS — archive vs remove: archive_vector (active=false, history preserved) for any vector the user has ever tracked. remove_vector is only for setup-time removals of vectors that were never started. Never hard-delete a vector with goals or inputs.
- VECTORS — reactivate: if the user wants to bring back an archived vector, call edit_vector({ vectorId, active: true }). Then immediately run the add-vector flow (propose_anchor → propose_goal → activate_vector_goal) to give it a fresh anchor and goal. Subject to the 6-vector cap.
- ANCHORS: each vector's current anchor is shown above (anchor: "..." line). If the user wants to change, correct, or consolidate duplicate anchors, call edit_anchor — it replaces ALL existing anchors for that vector with a single new one. You can do this without confirmation when the user's intent is clear.
- ADD-VECTOR FLOW — When the user wants to track a new life area, run these steps IN ORDER:
  1. Vector-vs-goal guard: if it's an outcome or achievement ("run a marathon", "get promoted", "finish my thesis"), do NOT create a vector — reframe it as a goal/anchor under an existing vector and explain why.
  2. Handful cap guard: already at ${activeVectorCount} active vectors (soft cap 6). If at cap, push back before creating. User can override once you've made the case.
  3. When the area and name are clear, call create_vector immediately — the vector appears in the UI as pending.
  4. Ask for the long-term destination FIRST: "What's the long-term goal here — where do you want to be in this area, and by what age?" → call propose_anchor once they answer.
  5. Ask for this quarter's goal, folding in current state: "What's the move this quarter? And where are you starting from right now?" Classify trackability (first match wins):
     - instrumented → continuous data available → type=metric or consistency
     - proxy → a leading indicator reliably predicts the outcome → metric on the proxy; set proxyModel
     - checkpoint → outcome judged externally → consistency (process); set attestationCadence
     - attested → periodic subjective judgment → milestone or rating; set attestationCadence
     If type and target are clear from one reading, call propose_goal immediately. If ambiguous, ask ONE targeted question naming the exact fork, then draft after one answer. Note: propose_goal returns an ID — keep it in mind in case the user wants to revise.
  6. Summarise: "Here's what I've got — [vector], anchor: [anchor], this quarter: [goal]. Ready?" → when user confirms, call activate_vector_goal. Acknowledge: "Done. [Vector] is live in your trajectory."
  - To revise a proposed goal: call remove_draft_goal (using the ID returned by propose_goal), then call propose_goal again with the correction.
  - The order is fixed: create_vector → propose_anchor → propose_goal → activate_vector_goal.
- When the user asks to delete or remove a logged entry (workout, session, anything in the activity log), call delete_input with the entry's ID from the activity log. After deletion, recalculation happens automatically.
- When the user asks to delete or remove a task (not complete — actually remove it), call delete_task.
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
    max_tokens: 1024,
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
      max_tokens: 1024,
      system,
      messages,
      tools: TOOLS,
    });
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text.trim() ?? '';
}
