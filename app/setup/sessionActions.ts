'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, anchors, goals, sessions } from '@/lib/db/schema';
import { VECTORS } from '@/lib/vectors';
import { chatDuringSetup, type ChatMessage } from '@/lib/llm/setupChat';
import { quarterBounds } from '@/lib/dates';
import type { SetupData } from './types';

// ── 1. Bootstrap: write user + vectors, open session ─────────────────────────

export async function startSetupSession(
  data: SetupData
): Promise<{ sessionId: string; quarter: string }> {
  const now     = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  // Write user preferences (replace if restarting setup)
  db.insert(user).values({
    id:           1,
    name:         data.name.trim() || 'You',
    timezone:     data.timezone || 'UTC',
    distanceUnit: data.distanceUnit,
    currency:     data.currency,
    weekStart:    data.weekStart,
    timeFormat:   data.timeFormat,
    lennaTone:    data.lennaTone,
    lennaAutonomy: data.lennaAutonomy,
    setupDone:    false,
  }).onConflictDoUpdate({
    target: user.id,
    set: {
      name:          data.name.trim() || 'You',
      timezone:      data.timezone || 'UTC',
      distanceUnit:  data.distanceUnit,
      currency:      data.currency,
      weekStart:     data.weekStart,
      timeFormat:    data.timeFormat,
      lennaTone:     data.lennaTone,
      lennaAutonomy: data.lennaAutonomy,
    },
  }).run();

  // Write vectors (replace existing)
  data.vectors.forEach((key, i) => {
    db.insert(vectors).values({
      id:    key,
      label: VECTORS[key].label,
      color: VECTORS[key].color,
      order: i,
    }).onConflictDoUpdate({
      target: vectors.id,
      set: { label: VECTORS[key].label, color: VECTORS[key].color, order: i },
    }).run();
  });

  // Clean up any previous draft goals + orphaned open sessions for this quarter
  db.delete(goals)
    .where(and(eq(goals.quarter, quarter), eq(goals.status, 'draft')))
    .run();
  db.delete(sessions)
    .where(and(eq(sessions.type, 'setup'), eq(sessions.status, 'open')))
    .run();

  // Create the setup session
  const session = db.insert(sessions).values({
    type:    'setup',
    quarter,
    status:  'open',
    phase:   'orient',
  }).returning().get();

  return { sessionId: session.id, quarter };
}

// ── 2. Chat turn ─────────────────────────────────────────────────────────────

type TurnResult = {
  reply:               string;
  phase:               string;
  anchors:             { id: string; vectorId: string; description: string; headlineMetric: string | null; targetAge: number | null }[];
  draftGoals:          { id: string; vectorId: string; description: string; type: string; startValue: number | null; targetValue: number | null; cadencePerWeek: number | null; paceShape: string }[];
  skippedGoalVectors:  string[];
  removedVectors:      string[];
  error?:              string;
};

export async function setupSessionTurn(
  message:   string,
  history:   ChatMessage[],
  sessionId: string,
  quarter:   string,
  selectedVectors: { id: string; label: string }[],
  priorSkippedGoalVectors: string[] = [],
  priorRemovedVectors: string[] = []
): Promise<TurnResult> {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return { reply: '', phase: 'orient', anchors: [], draftGoals: [], skippedGoalVectors: [], removedVectors: [], error: 'Session not found.' };

  const u = db.select().from(user).get();

  // Load anchors for any of the selected vectors
  const currentAnchors = db.select().from(anchors).all()
    .filter(a => selectedVectors.some(v => v.id === a.vectorId));

  const currentDraftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, quarter), eq(goals.status, 'draft')))
    .all();

  let finalPhase = session.phase;
  const skippedGoalVectors: string[] = [...priorSkippedGoalVectors];
  const removedVectors: string[] = [...priorRemovedVectors];

  let reply: string;
  try {
    reply = await chatDuringSetup(
      message,
      {
        userName:   u?.name     ?? 'You',
        timezone:   u?.timezone ?? 'UTC',
        lennaTone:     (u?.lennaTone    ?? 'warm')  as 'warm' | 'neutral' | 'direct',
        lennaAutonomy: (u?.lennaAutonomy ?? 'draft') as 'suggest' | 'draft' | 'act',
        phase:         session.phase,
        quarter,
        vectors:    selectedVectors.filter(v => !removedVectors.includes(v.id)),
        anchors:    currentAnchors.map(a => ({ vectorId: a.vectorId, description: a.description })),
        draftGoals: currentDraftGoals.map(g => ({ vectorId: g.vectorId, description: g.description, type: g.type })),
        skippedGoalVectors,
        removedVectors,
      },
      history,
      async (toolName, input) => {
        if (toolName === 'propose_anchor') {
          const { vectorId, description, headlineMetric, targetAge, rationale } =
            input as { vectorId: string; description: string; headlineMetric?: string; targetAge?: number; rationale: string };

          // Upsert — replace if Lenna revises
          const existing = db.select().from(anchors).where(eq(anchors.vectorId, vectorId)).get();
          if (existing) {
            db.delete(anchors).where(eq(anchors.id, existing.id)).run();
          }
          db.insert(anchors).values({
            vectorId,
            description,
            headlineMetric: headlineMetric ?? null,
            targetAge:      targetAge ?? null,
          }).run();

          return `Anchor for ${vectorId} recorded: "${description}"`;
        }

        if (toolName === 'propose_goal') {
          const { vectorId, description, type, startValue, targetValue, cadencePerWeek, paceShape, rationale } =
            input as {
              vectorId: string; description: string; type: string;
              startValue?: number; targetValue?: number; cadencePerWeek?: number;
              paceShape?: string; rationale: string;
            };

          // Validate
          const validTypes = ['milestone', 'metric', 'consistency'];
          if (!validTypes.includes(type)) return `Invalid type "${type}".`;

          const { start: startDate, end: endDate } = quarterBounds(quarter);

          // Upsert — replace if Lenna revises the goal for this vector
          const existingGoal = db.select().from(goals)
            .where(and(eq(goals.quarter, quarter), eq(goals.vectorId, vectorId), eq(goals.status, 'draft')))
            .get();
          if (existingGoal) {
            db.delete(goals).where(eq(goals.id, existingGoal.id)).run();
          }

          db.insert(goals).values({
            vectorId,
            quarter,
            description,
            type:           type as 'milestone' | 'metric' | 'consistency',
            status:         'draft',
            paceShape:      (paceShape ?? 'linear') as 'linear' | 'easeIn' | 'easeOut' | 'sCurve',
            startDate,
            endDate,
            startValue:     startValue ?? null,
            targetValue:    targetValue ?? null,
            cadencePerWeek: cadencePerWeek ?? null,
          }).run();

          return `Goal for ${vectorId} drafted: "${description}" (${type})`;
        }

        if (toolName === 'skip_goal') {
          const { vectorId } = input as { vectorId: string; rationale: string };
          skippedGoalVectors.push(vectorId);
          return `Goal for ${vectorId} skipped this quarter.`;
        }

        if (toolName === 'remove_vector') {
          const { vectorId } = input as { vectorId: string; rationale: string };
          // Remove anchor if any
          const existingAnchor = db.select().from(anchors).where(eq(anchors.vectorId, vectorId)).get();
          if (existingAnchor) db.delete(anchors).where(eq(anchors.id, existingAnchor.id)).run();
          // Remove draft goals if any
          db.delete(goals)
            .where(and(eq(goals.vectorId, vectorId), eq(goals.status, 'draft')))
            .run();
          // Remove the vector itself
          db.delete(vectors).where(eq(vectors.id, vectorId)).run();
          removedVectors.push(vectorId);
          return `${vectorId} removed from your vectors.`;
        }

        if (toolName === 'advance_phase') {
          const { phase } = input as { phase: 'draft' | 'commit' };
          db.update(sessions).set({ phase }).where(eq(sessions.id, sessionId)).run();
          finalPhase = phase;
          return `Session advanced to ${phase} phase.`;
        }

        return 'Unknown tool.';
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { reply: '', phase: finalPhase, anchors: [], draftGoals: [], skippedGoalVectors: [], removedVectors: [], error: String(msg) };
  }

  // Reload state after tools ran
  const updatedAnchors = db.select().from(anchors).all()
    .filter(a => selectedVectors.some(v => v.id === a.vectorId));
  const updatedGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, quarter), eq(goals.status, 'draft')))
    .all();

  return {
    reply,
    phase:              finalPhase,
    anchors:            updatedAnchors.map(a => ({
      id: a.id, vectorId: a.vectorId, description: a.description,
      headlineMetric: a.headlineMetric, targetAge: a.targetAge,
    })),
    draftGoals:         updatedGoals.map(g => ({
      id: g.id, vectorId: g.vectorId, description: g.description,
      type: g.type, startValue: g.startValue, targetValue: g.targetValue,
      cadencePerWeek: g.cadencePerWeek, paceShape: g.paceShape,
    })),
    skippedGoalVectors,
    removedVectors,
  };
}

// ── 3. Commit: flip drafts → active, close session, set setupDone ─────────────

export async function commitSetupSession(sessionId: string): Promise<void> {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return;

  const { quarter } = session;

  // Flip all draft goals for this quarter to active
  const draftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, quarter), eq(goals.status, 'draft')))
    .all();

  draftGoals.forEach(g => {
    db.update(goals).set({ status: 'active' }).where(eq(goals.id, g.id)).run();
  });

  // Close the session
  db.update(sessions).set({
    status:      'complete',
    phase:       'commit',
    completedAt: new Date(),
    committedGoalIds: draftGoals.map(g => g.id),
  }).where(eq(sessions.id, sessionId)).run();

  // Mark user as set up
  db.update(user).set({ setupDone: true }).where(eq(user.id, 1)).run();

  redirect('/today');
}
