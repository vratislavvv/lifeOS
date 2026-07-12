'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { db, DEFAULT_GROUP_ID } from '@/lib/db';
import { inputs, scores, vectors, goals, tasks, taskGroups, user as userTable, anchors } from '@/lib/db/schema';
import { chatWithLenna, type ChatMessage } from '@/lib/llm/chat';
import { recalculate } from '@/lib/scoring/recalculate';
import { phraseScore } from '@/lib/llm/phrase';
import { MAX_INPUT_DELTA } from '@/lib/scoring/constants';
import { computeCompletion } from '@/lib/scoring/completion';
import { goalTau, expectedPace } from '@/lib/scoring/pace';
import { quarterBounds } from '@/lib/dates';

export async function sendToLenna(
  rawText:    string,
  history:    ChatMessage[],
  lastLogged?: { vectorId: string; summary: string; progressDelta: number },
): Promise<{ reply?: string; error?: string; justLogged?: { vectorId: string; summary: string; progressDelta: number }; needsRefresh?: boolean }> {
  const text = rawText.trim();
  if (!text) return {};

  const now = new Date();
  const u = db.select().from(userTable).get();
  const tz = u?.timezone ?? 'UTC';
  const today = now.toLocaleDateString('en-CA', { timeZone: tz });
  const [todayYear, todayMonth] = today.split('-').map(Number);
  const quarter = `${todayYear}-Q${Math.ceil(todayMonth / 3)}`;
  const vecs = db.select().from(vectors).all();
  const allAnchors = db.select().from(anchors).all();
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
  let needsRefresh = false;

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
        vectors: vecs.map(v => ({ id: v.id, label: v.label, active: v.active ?? true })),
        anchors: allAnchors.map(a => ({ vectorId: a.vectorId, description: a.description, targetAge: a.targetAge })),
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
          id: i.id,
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

        if (toolName === 'create_vector') {
          const { label, color, description } = input as { label: string; color: string; description?: string };
          const trimmed = label.trim();
          if (!trimmed) return 'Label cannot be empty.';
          const activeCount = vecs.filter(v => v.active).length;
          if (activeCount >= 6) return `Already at ${activeCount} active vectors (cap is 6) — archive one first before adding another.`;
          // Slug from label with collision suffix
          let slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const existing = vecs.map(v => v.id);
          if (existing.includes(slug)) {
            let i = 2;
            while (existing.includes(`${slug}-${i}`)) i++;
            slug = `${slug}-${i}`;
          }
          const newVec = db.insert(vectors).values({
            id: slug, label: trimmed, color,
            description: description ?? null,
            order: vecs.length,
            active: true,
            createdVia: 'custom',
          }).returning().get();
          vecs.push({ ...newVec, active: true });
          revalidatePath('/today');
          revalidatePath('/quarter');
          return `Created vector "${newVec.label}" (id: ${newVec.id}). Now set an anchor and quarterly goal for it so it contributes to scoring.`;
        }

        if (toolName === 'edit_anchor') {
          const { vectorId, description, headlineMetric, targetAge } =
            input as { vectorId: string; description: string; headlineMetric?: string; targetAge?: number };
          const vec = vecs.find(v => v.id === vectorId);
          if (!vec) return 'Vector not found.';
          db.delete(anchors).where(eq(anchors.vectorId, vectorId)).run();
          db.insert(anchors).values({
            vectorId,
            description,
            headlineMetric: headlineMetric ?? null,
            targetAge:      targetAge ?? null,
          }).run();
          needsRefresh = true;
          revalidatePath('/quarter');
          return `Anchor updated for "${vec.label}": "${description}"${targetAge != null ? ` (by age ${targetAge})` : ''}`;
        }

        if (toolName === 'propose_anchor') {
          const { vectorId, description, headlineMetric, targetAge } =
            input as { vectorId: string; description: string; headlineMetric?: string; targetAge?: number; rationale: string };
          const vec = vecs.find(v => v.id === vectorId);
          if (!vec) return 'Vector not found.';
          db.delete(anchors).where(eq(anchors.vectorId, vectorId)).run();
          db.insert(anchors).values({
            vectorId,
            description,
            headlineMetric: headlineMetric ?? null,
            targetAge:      targetAge ?? null,
          }).run();
          needsRefresh = true;
          revalidatePath('/quarter');
          return `Anchor recorded for "${vec.label}": "${description}"`;
        }

        if (toolName === 'propose_goal') {
          const {
            vectorId, description, type, trackabilityTier, dataSource, proxyModel,
            attestationCadence, startValue, targetValue, cadencePerWeek, paceShape,
          } = input as {
            vectorId: string; description: string; type: string;
            trackabilityTier?: string; dataSource?: string; proxyModel?: string;
            attestationCadence?: string; startValue?: number; targetValue?: number;
            cadencePerWeek?: number; paceShape?: string; rationale: string;
          };
          const vec = vecs.find(v => v.id === vectorId);
          if (!vec) return 'Vector not found.';
          const validTypes = ['milestone', 'metric', 'consistency'];
          if (!validTypes.includes(type)) return `Invalid type "${type}".`;
          const dup = db.select().from(goals)
            .where(and(eq(goals.vectorId, vectorId), eq(goals.status, 'draft')))
            .all().find(g => g.description === description);
          if (dup) return `Already drafted: "${description}"`;
          const { end: endDate } = quarterBounds(quarter);
          const inserted = db.insert(goals).values({
            vectorId,
            quarter,
            description,
            type:               type as 'milestone' | 'metric' | 'consistency',
            status:             'draft',
            trackabilityTier:   (trackabilityTier ?? null) as 'instrumented' | 'proxy' | 'checkpoint' | 'attested' | null,
            dataSource:         dataSource ?? null,
            proxyModel:         proxyModel ?? null,
            attestationCadence: attestationCadence ?? null,
            paceShape:          (paceShape ?? 'linear') as 'linear' | 'easeIn' | 'easeOut' | 'sCurve',
            startDate:          today,
            endDate,
            startValue:         startValue ?? null,
            targetValue:        targetValue ?? null,
            cadencePerWeek:     cadencePerWeek ?? null,
          }).returning().get();
          needsRefresh = true;
          revalidatePath('/quarter');
          return `Goal drafted (id: ${inserted.id}) for "${vec.label}": "${description}" (${type})`;
        }

        if (toolName === 'remove_draft_goal') {
          const { goalId } = input as { goalId: string };
          const goal = db.select().from(goals)
            .where(and(eq(goals.id, goalId), eq(goals.status, 'draft'))).get();
          if (!goal) return 'Draft goal not found.';
          db.delete(goals).where(eq(goals.id, goalId)).run();
          needsRefresh = true;
          return 'Draft goal removed.';
        }

        if (toolName === 'activate_vector_goal') {
          const { vectorId } = input as { vectorId: string };
          const vec = vecs.find(v => v.id === vectorId);
          if (!vec) return 'Vector not found.';
          const draftGoals = db.select().from(goals)
            .where(and(eq(goals.vectorId, vectorId), eq(goals.status, 'draft')))
            .all();
          if (draftGoals.length === 0) return 'No draft goals found for this vector. Use propose_goal first.';
          for (const g of draftGoals) {
            db.update(goals).set({ status: 'active', startDate: today }).where(eq(goals.id, g.id)).run();
          }
          const result = recalculate(today);
          if (!('calibrating' in result)) {
            operatingLevel  = result.operatingLevel;
            vectorBreakdown = result.vectorBreakdown;
            db.delete(scores).where(eq(scores.date, today)).run();
            db.insert(scores).values({
              date:              today,
              operatingLevel:    result.operatingLevel,
              operatingLevelRaw: result.operatingLevelRaw,
              alignment:         result.alignment,
              contributors:      result.contributors,
              vectorBreakdown:   result.vectorBreakdown,
            }).run();
          }
          needsRefresh = true;
          revalidatePath('/today');
          revalidatePath('/quarter');
          return `"${vec.label}" is now live — ${draftGoals.length} goal(s) activated. It now contributes to your operating level.`;
        }

        if (toolName === 'edit_vector') {
          const { vectorId, label, color, description, order, weight, active } = input as {
            vectorId: string; label?: string; color?: string; description?: string;
            order?: number; weight?: number; active?: boolean;
          };
          const vec = vecs.find(v => v.id === vectorId);
          if (!vec) return 'Vector not found.';
          // Reactivation cap check
          if (active === true && !vec.active) {
            const activeCount = vecs.filter(v => v.active).length;
            if (activeCount >= 6) return `Already at ${activeCount} active vectors (cap is 6) — archive one first before reactivating this one.`;
          }
          const updates: Record<string, unknown> = {};
          if (label       !== undefined) updates.label       = label;
          if (color       !== undefined) updates.color       = color;
          if (description !== undefined) updates.description = description;
          if (order       !== undefined) updates.order       = order;
          if (weight      !== undefined) updates.weight      = weight;
          if (active      !== undefined) updates.active      = active;
          if (Object.keys(updates).length === 0) return 'No changes specified.';
          db.update(vectors).set(updates).where(eq(vectors.id, vectorId)).run();
          needsRefresh = true;
          revalidatePath('/today');
          revalidatePath('/quarter');
          const wasReactivated = active === true && !vec.active;
          return wasReactivated
            ? `"${vec.label}" reactivated. Now run the add-vector flow to set a fresh anchor and goal for this quarter.`
            : `Updated "${vec.label}".`;
        }

        if (toolName === 'archive_vector') {
          const { vectorId } = input as { vectorId: string };
          const vec = vecs.find(v => v.id === vectorId);
          if (!vec) return 'Vector not found.';
          if (!vec.active) return `"${vec.label}" is already archived.`;
          // Close all active goals for this vector
          db.update(goals).set({ status: 'abandoned' })
            .where(and(eq(goals.vectorId, vectorId), eq(goals.status, 'active'))).run();
          db.update(vectors).set({ active: false }).where(eq(vectors.id, vectorId)).run();
          vec.active = false;
          // Recalculate score without this vector
          const result = recalculate(today);
          if (!('calibrating' in result)) {
            operatingLevel  = result.operatingLevel;
            vectorBreakdown = result.vectorBreakdown;
            db.delete(scores).where(eq(scores.date, today)).run();
            db.insert(scores).values({
              date:              today,
              operatingLevel:    result.operatingLevel,
              operatingLevelRaw: result.operatingLevelRaw,
              alignment:         result.alignment,
              contributors:      result.contributors,
              vectorBreakdown:   result.vectorBreakdown,
            }).run();
          }
          revalidatePath('/today');
          revalidatePath('/quarter');
          return `Archived "${vec.label}". History preserved; excluded from scoring.`;
        }

        if (toolName === 'delete_input') {
          const { inputIds } = input as { inputIds: string[] };
          const deleted: string[] = [];
          for (const id of inputIds) {
            const entry = db.select().from(inputs).where(eq(inputs.id, id)).get();
            if (!entry) continue;
            db.delete(inputs).where(eq(inputs.id, id)).run();
            deleted.push(entry.rawText ?? id);
          }
          if (deleted.length === 0) return 'No entries found.';
          const result = recalculate(today);
          if (!('calibrating' in result)) {
            operatingLevel  = result.operatingLevel;
            vectorBreakdown = result.vectorBreakdown;
            db.delete(scores).where(eq(scores.date, today)).run();
            db.insert(scores).values({
              date:              today,
              operatingLevel:    result.operatingLevel,
              operatingLevelRaw: result.operatingLevelRaw,
              alignment:         result.alignment,
              contributors:      result.contributors,
              vectorBreakdown:   result.vectorBreakdown,
            }).run();
          }
          revalidatePath('/today');
          revalidatePath('/quarter');
          return `Deleted ${deleted.length} entries: ${deleted.join(', ')}.`;
        }

        if (toolName === 'delete_task') {
          const { taskId } = input as { taskId: string };
          const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
          if (!task) return 'Task not found.';
          db.delete(tasks).where(eq(tasks.id, taskId)).run();
          revalidatePath('/today');
          revalidatePath('/tasks');
          return `Deleted "${task.title}".`;
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
  return { reply, justLogged: justLogged ?? undefined, needsRefresh: needsRefresh || undefined };
}
