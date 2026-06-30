'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, DEFAULT_GROUP_ID } from '@/lib/db';
import { inputs, scores, vectors, goals, tasks, taskGroups, user as userTable } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';
import { extractInput } from '@/lib/llm/extract';
import { chatWithLenna, type ChatMessage } from '@/lib/llm/chat';
import { computeScore, quarterPaceNow } from '@/lib/scoring/compute';

export async function sendToLenna(
  rawText: string,
  history: ChatMessage[]
): Promise<{ reply?: string; error?: string }> {
  const text = rawText.trim();
  if (!text) return {};

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const u = db.select().from(userTable).get();
  const vecs = db.select().from(vectors).all();
  const quarterGoals = db.select().from(goals).where(eq(goals.quarter, quarter)).all();
  const groups = db.select().from(taskGroups).orderBy(asc(taskGroups.order)).all();
  const todayTasks = db.select().from(tasks).where(eq(tasks.date, today)).orderBy(asc(tasks.createdAt)).all();

  let extracted: Awaited<ReturnType<typeof extractInput>>;
  try {
    extracted = await extractInput(text, vecs, quarterGoals);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { error: `Extraction failed: ${msg}` };
  }

  let operatingLevel: number | null = null;
  let vectorBreakdown: Record<string, number> = {};
  let justLogged: { vectorId: string; summary: string; progressDelta: number } | null = null;

  if (extracted.isProgressLog) {
    const validVectorIds = new Set(vecs.map(v => v.id));
    const validGoalIds = new Set(quarterGoals.map(g => g.id));
    const vectorId = validVectorIds.has(extracted.vectorId) ? extracted.vectorId : (vecs[0]?.id ?? 'craft');
    const goalId = extracted.goalId && validGoalIds.has(extracted.goalId) ? extracted.goalId : null;

    db.insert(inputs).values({
      date: today,
      type: 'manual',
      vectorId,
      goalId,
      rawText: text,
      progressDelta: extracted.progressDelta,
      confidence: extracted.confidence,
      metadata: { summary: extracted.summary },
    }).run();

    const allInputs = db.select().from(inputs).all();
    const pace = quarterPaceNow();
    const computed = computeScore(vecs, allInputs, pace);
    operatingLevel = computed.operatingLevel;
    vectorBreakdown = computed.vectorBreakdown;

    db.delete(scores).where(eq(scores.date, today)).run();
    db.insert(scores).values({
      date: today,
      operatingLevel,
      vectorBreakdown,
      explanation: `${allInputs.length} input(s) · latest: ${extracted.summary}`,
    }).run();

    justLogged = { vectorId, summary: extracted.summary, progressDelta: extracted.progressDelta };
  } else {
    const latest = db.select().from(scores).where(eq(scores.date, today)).get();
    if (latest) {
      operatingLevel = latest.operatingLevel;
      vectorBreakdown = latest.vectorBreakdown as Record<string, number>;
    }
  }

  let reply: string;
  try {
    reply = await chatWithLenna(
      text,
      {
        userName: u?.name ?? 'You',
        timezone: u?.timezone ?? 'UTC',
        quarter,
        operatingLevel,
        vectorBreakdown,
        vectors: vecs.map(v => ({ id: v.id, label: v.label })),
        goals: quarterGoals.map(g => ({ vectorId: g.vectorId ?? '', description: g.description ?? '' })),
        groups: groups.map(g => ({ id: g.id, name: g.name })),
        tasks: todayTasks.map(t => ({ id: t.id, title: t.title, done: t.done })),
        justLogged,
      },
      history,
      async (toolName, input) => {
        if (toolName === 'create_task_group') {
          const { name, color } = input as { name: string; color?: string };
          const trimmed = name.trim();
          if (!trimmed) return 'Group name cannot be empty.';
          const existing = groups.find(g => g.name.toLowerCase() === trimmed.toLowerCase());
          if (existing) return `Group "${existing.name}" already exists (id: ${existing.id}).`;
          const newGroup = { name: trimmed, color: color ?? null, order: groups.length };
          const inserted = db.insert(taskGroups).values(newGroup).returning().get();
          groups.push(inserted);
          return `Group "${inserted.name}" created (id: ${inserted.id}). You can now add tasks to it.`;
        }

        if (toolName === 'complete_task') {
          const { taskId } = input as { taskId: string };
          const task = todayTasks.find(t => t.id === taskId);
          if (!task) return 'Task not found.';
          db.update(tasks).set({ done: true }).where(eq(tasks.id, taskId)).run();
          return `"${task.title}" marked as done.`;
        }

        if (toolName === 'add_task') {
          const { title, groupId, important, urgent, dueDate } = input as {
            title: string;
            groupId?: string;
            important?: boolean;
            urgent?: boolean;
            dueDate?: string;
          };
          const validGroupId = groups.find(g => g.id === groupId)?.id ?? DEFAULT_GROUP_ID;
          db.insert(tasks).values({
            title,
            date: today,
            groupId: validGroupId,
            important: important ?? false,
            urgent: urgent ?? false,
            dueDate: dueDate ?? null,
          }).run();
          return `Task "${title}" added to today's list.`;
        }

        if (toolName === 'log_progress') {
          const { vectorId, description, progressDelta } = input as {
            vectorId: string;
            description: string;
            progressDelta: number;
          };
          const validVec = vecs.find(v => v.id === vectorId);
          if (!validVec) return 'Invalid vector ID.';

          db.insert(inputs).values({
            date: today,
            type: 'manual',
            vectorId,
            goalId: null,
            rawText: description,
            progressDelta: Math.min(Math.max(progressDelta, 0), 1),
            confidence: 0.9,
            metadata: { summary: description },
          }).run();

          const allInputs = db.select().from(inputs).all();
          const pace = quarterPaceNow();
          const computed = computeScore(vecs, allInputs, pace);
          operatingLevel = computed.operatingLevel;
          vectorBreakdown = computed.vectorBreakdown;

          db.delete(scores).where(eq(scores.date, today)).run();
          db.insert(scores).values({
            date: today,
            operatingLevel: computed.operatingLevel,
            vectorBreakdown: computed.vectorBreakdown,
            explanation: `${allInputs.length} input(s) · latest: ${description}`,
          }).run();

          return `Logged "${description}" under ${validVec.label} (+${Math.round(progressDelta * 100)}pp).`;
        }

        return 'Unknown tool.';
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { error: `Chat failed: ${msg}` };
  }

  revalidatePath('/today');
  return { reply };
}
