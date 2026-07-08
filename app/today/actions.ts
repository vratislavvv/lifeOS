'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { db, DEFAULT_GROUP_ID } from '@/lib/db';
import { inputs, scores, vectors, goals, tasks, taskGroups, user as userTable } from '@/lib/db/schema';
import { chatWithLenna, type ChatMessage } from '@/lib/llm/chat';
import { recalculate } from '@/lib/scoring/recalculate';
import { phraseScore } from '@/lib/llm/phrase';
import { MAX_INPUT_DELTA } from '@/lib/scoring/constants';
import { computeCompletion } from '@/lib/scoring/completion';
import { goalTau, expectedPace } from '@/lib/scoring/pace';

export async function sendToLenna(
  rawText:    string,
  history:    ChatMessage[],
  lastLogged?: { vectorId: string; summary: string; progressDelta: number },
): Promise<{ reply?: string; error?: string; justLogged?: { vectorId: string; summary: string; progressDelta: number } }> {
  const text = rawText.trim();
  if (!text) return {};

  const now = new Date();
  const u = db.select().from(userTable).get();
  const tz = u?.timezone ?? 'UTC';
  const today = now.toLocaleDateString('en-CA', { timeZone: tz });
  const [todayYear, todayMonth] = today.split('-').map(Number);
  const quarter = `${todayYear}-Q${Math.ceil(todayMonth / 3)}`;
  const vecs = db.select().from(vectors).all();
  const quarterGoals = db.select().from(goals).where(eq(goals.quarter, quarter)).all();
  const groups = db.select().from(taskGroups).orderBy(asc(taskGroups.order)).all();
  const todayTasks = db.select().from(tasks).where(eq(tasks.date, today)).orderBy(asc(tasks.createdAt)).all();

  // Upcoming tasks: any undone task with a dueDate in the next 14 days
  const fourteenDaysFromNow = new Date(now);
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);
  const upcomingTasks = db.select().from(tasks)
    .where(and(
      isNotNull(tasks.dueDate),
      gte(tasks.dueDate, today),
      lte(tasks.dueDate, fourteenDaysFromNow.toLocaleDateString('en-CA', { timeZone: tz })),
      eq(tasks.done, false),
    ))
    .orderBy(asc(tasks.dueDate))
    .all();

  // Activity log: last 14 days of inputs for context
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const recentInputs = db.select().from(inputs)
    .where(gte(inputs.date, fourteenDaysAgo.toLocaleDateString('en-CA', { timeZone: tz })))
    .orderBy(desc(inputs.date))
    .all();

  // OL trend: last 7 scores for trend context
  const recentScores = db.select().from(scores)
    .where(lte(scores.date, today))
    .orderBy(desc(scores.date))
    .limit(7)
    .all();

  // Goal completion snapshots (c%, e% as of today)
  const quarterInputsForGoals = db.select().from(inputs)
    .where(and(gte(inputs.date, `${quarter.split('-Q')[0]}-${String((parseInt(quarter.split('-Q')[1]) - 1) * 3 + 1).padStart(2, '0')}-01`), lte(inputs.date, today)))
    .all();

  const goalSnapshots = quarterGoals
    .filter(g => g.status === 'active')
    .map(g => {
      const gInputs = quarterInputsForGoals.filter(i => i.goalId === g.id || (i.goalId === null && i.vectorId === g.vectorId));
      const c = computeCompletion(
        { type: g.type as 'milestone' | 'metric' | 'consistency', trackabilityTier: g.trackabilityTier, proxyModel: g.proxyModel, startDate: g.startDate, endDate: g.endDate, cadencePerWeek: g.cadencePerWeek, startValue: g.startValue, targetValue: g.targetValue },
        gInputs.map(i => ({ kind: i.kind, progressDelta: i.progressDelta, value: i.value, occurredCount: i.occurredCount, durationMin: i.durationMin, confidence: i.confidence, date: i.date })),
        today,
      );
      const tau = goalTau(g.startDate, g.endDate, today);
      const e = expectedPace(tau, g.paceShape, g.paceParam);
      return { id: g.id, vectorId: g.vectorId, c: Math.round(c * 100), e: Math.round(e * 100) };
    });

  // Load current score for context (score updates happen via log_progress tool only)
  let operatingLevel: number | null = null;
  let vectorBreakdown: Record<string, number> = {};
  // Seed justLogged from the caller (previous turn) so Lenna's system prompt has it
  let justLogged: { vectorId: string; summary: string; progressDelta: number } | null = lastLogged ?? null;

  const latestScore = db.select().from(scores).where(eq(scores.date, today)).get();
  if (latestScore) {
    operatingLevel = latestScore.operatingLevel;
    vectorBreakdown = latestScore.vectorBreakdown as Record<string, number>;
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
        goals: quarterGoals.map(g => ({
          id: g.id,
          vectorId: g.vectorId ?? '',
          description: g.description ?? '',
          type: g.type ?? 'milestone',
          cadencePerWeek: g.cadencePerWeek,
        })),
        goalSnapshots,
        groups: groups.map(g => ({ id: g.id, name: g.name, parentId: g.parentId ?? null })),
        tasks: todayTasks.map(t => ({ id: t.id, title: t.title, done: t.done })),
        upcomingTasks: upcomingTasks.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate!, done: t.done })),
        recentInputs: recentInputs.map(i => ({
          date: i.date,
          vectorId: i.vectorId ?? '',
          description: (i.metadata as { summary?: string } | null)?.summary ?? i.rawText ?? '',
          kind: i.kind ?? '',
          occurredCount: i.occurredCount,
          value: i.value,
        })),
        olTrend: recentScores.map(s => ({ date: s.date, ol: Math.round(s.operatingLevel) })),
        justLogged,
      },
      history,
      async (toolName, input) => {
        if (toolName === 'delete_task_group') {
          const { groupId } = input as { groupId: string };
          const group = groups.find(g => g.id === groupId);
          if (!group) return 'Group not found.';
          if (group.isDefault) return 'Cannot delete the default Daily group.';
          // recursively collect this group + all descendant group IDs
          function descendants(id: string): string[] {
            const kids = groups.filter(g => g.parentId === id).map(g => g.id);
            return [id, ...kids.flatMap(descendants)];
          }
          const ids = descendants(groupId);
          for (const id of ids) {
            db.delete(tasks).where(eq(tasks.groupId, id)).run();
            db.delete(taskGroups).where(eq(taskGroups.id, id)).run();
          }
          revalidatePath('/tasks');
          return `Deleted "${group.name}" and its tasks.`;
        }

        if (toolName === 'create_task_group') {
          const { name, color, parentId } = input as { name: string; color?: string; parentId?: string };
          const trimmed = name.trim();
          if (!trimmed) return 'Group name cannot be empty.';
          if (parentId && !groups.find(g => g.id === parentId)) return `Parent group "${parentId}" not found.`;
          const siblings = groups.filter(g => (g.parentId ?? null) === (parentId ?? null));
          const newGroup = { name: trimmed, color: color ?? null, parentId: parentId ?? null, order: siblings.length };
          const inserted = db.insert(taskGroups).values(newGroup).returning().get();
          groups.push(inserted);
          const parentName = parentId ? groups.find(g => g.id === parentId)?.name : null;
          return `"${inserted.name}" created${parentName ? ` as a sublist of "${parentName}"` : ''} (id: ${inserted.id}).`;
        }

        if (toolName === 'complete_task') {
          const { taskId } = input as { taskId: string };
          const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
          if (!task) return 'Task not found.';
          db.update(tasks).set({ done: true }).where(eq(tasks.id, taskId)).run();
          return `"${task.title}" marked as done.`;
        }

        if (toolName === 'edit_task') {
          const { taskId, title, dueDate, groupId } = input as {
            taskId: string; title?: string; dueDate?: string; groupId?: string;
          };
          const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
          if (!task) return 'Task not found.';
          const updates: Record<string, unknown> = {};
          if (title   !== undefined) updates.title   = title;
          if (dueDate !== undefined) updates.dueDate = dueDate || null;
          if (groupId   !== undefined) {
            const validGroup = groups.find(g => g.id === groupId);
            if (!validGroup) return 'Group not found.';
            updates.groupId = groupId;
          }
          if (Object.keys(updates).length === 0) return 'No changes specified.';
          db.update(tasks).set(updates).where(eq(tasks.id, taskId)).run();
          return `Updated "${task.title}".`;
        }

        if (toolName === 'add_task') {
          const { title, groupId, dueDate } = input as {
            title: string;
            groupId?: string;
            dueDate?: string;
          };
          const validGroupId = groups.find(g => g.id === groupId)?.id ?? DEFAULT_GROUP_ID;
          db.insert(tasks).values({
            title,
            date: today,
            groupId: validGroupId,
            dueDate: dueDate ?? null,
          }).run();
          return `Task "${title}" added to today's list.`;
        }

        if (toolName === 'log_progress') {
          const { vectorId, goalId: rawGoalId, description, kind, progressDelta, value, occurredCount } = input as {
            vectorId:      string;
            goalId?:       string;
            description:   string;
            kind:          'milestone_delta' | 'metric_value' | 'consistency_occurrence';
            progressDelta?: number;
            value?:         number;
            occurredCount?: number;
          };

          const validVec = vecs.find(v => v.id === vectorId);
          if (!validVec) return 'Invalid vector ID.';

          const matchedGoal = rawGoalId
            ? quarterGoals.find(g => g.id === rawGoalId)
            : quarterGoals.find(g => g.vectorId === vectorId && g.status === 'active');

          // Clamp milestone delta at MAX_INPUT_DELTA on write
          const safeDelta = kind === 'milestone_delta' && progressDelta != null
            ? Math.sign(progressDelta) * Math.min(Math.abs(progressDelta), MAX_INPUT_DELTA)
            : null;

          db.insert(inputs).values({
            date:          today,
            type:          'manual',
            vectorId,
            goalId:        matchedGoal?.id ?? null,
            rawText:       description,
            kind,
            progressDelta: safeDelta,
            value:         kind === 'metric_value'           ? (value         ?? null) : null,
            occurredCount: kind === 'consistency_occurrence' ? (occurredCount ?? 1)    : null,
            confidence:    0.9,
            metadata:      { summary: description },
          }).run();

          // Recalculate full scoring engine
          const result = recalculate(today);
          if (!('calibrating' in result)) {
            operatingLevel  = result.operatingLevel;
            vectorBreakdown = result.vectorBreakdown;

            // Write score immediately so revalidatePath sees it
            db.delete(scores).where(eq(scores.date, today)).run();
            db.insert(scores).values({
              date:              today,
              operatingLevel:    result.operatingLevel,
              operatingLevelRaw: result.operatingLevelRaw,
              alignment:         result.alignment,
              contributors:      result.contributors,
              vectorBreakdown:   result.vectorBreakdown,
            }).run();

            // Async: backfill one-sentence explanation
            phraseScore(result.operatingLevel, result.contributors).then(explanation => {
              db.update(scores).set({ explanation }).where(eq(scores.date, today)).run();
            }).catch(() => { /* ignore */ });
          }

          // Set justLogged so Lenna's system prompt on the NEXT message knows what was logged
          justLogged = { vectorId, summary: description, progressDelta: safeDelta ?? 0 };

          const logStr = kind === 'metric_value'           ? `value: ${value}`
                       : kind === 'consistency_occurrence' ? '1 session logged'
                       : `Δ${Math.round((safeDelta ?? 0) * 100)}pp`;
          return `Logged "${description}" under ${validVec.label} (${logStr}). OL is now ${Math.round(operatingLevel ?? 0)}.`;
        }

        return 'Unknown tool.';
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { error: `Chat failed: ${msg}` };
  }

  revalidatePath('/today');
  revalidatePath('/quarter');
  return { reply, justLogged: justLogged ?? undefined };
}
