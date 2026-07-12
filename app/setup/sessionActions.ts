'use server';

import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, anchors, goals, sessions } from '@/lib/db/schema';
import { chatDuringSetup, type ChatMessage } from '@/lib/llm/setupChat';
import { quarterBounds } from '@/lib/dates';
import type { SetupData } from './types';

// ── 1. Bootstrap: write user, open session ────────────────────────────────────

export async function startSetupSession(
  data: SetupData
): Promise<{ sessionId: string; quarter: string }> {
  const now     = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  // Write user preferences (replace if restarting setup)
  db.insert(user).values({
    id:            1,
    name:          data.name.trim() || 'You',
    dateOfBirth:   data.dateOfBirth || null,
    timezone:      data.timezone || 'UTC',
    distanceUnit:  data.distanceUnit,
    currency:      data.currency,
    weekStart:     data.weekStart,
    timeFormat:    data.timeFormat,
    lennaTone:     data.lennaTone,
    lennaAutonomy: data.lennaAutonomy,
    setupDone:     false,
  }).onConflictDoUpdate({
    target: user.id,
    set: {
      name:          data.name.trim() || 'You',
      dateOfBirth:   data.dateOfBirth || null,
      timezone:      data.timezone || 'UTC',
      distanceUnit:  data.distanceUnit,
      currency:      data.currency,
      weekStart:     data.weekStart,
      timeFormat:    data.timeFormat,
      lennaTone:     data.lennaTone,
      lennaAutonomy: data.lennaAutonomy,
    },
  }).run();

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
  vectors:             { id: string; label: string; color: string }[];
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
  priorSkippedGoalVectors: string[] = [],
  priorRemovedVectors: string[] = []
): Promise<TurnResult> {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return { reply: '', phase: 'orient', vectors: [], anchors: [], draftGoals: [], skippedGoalVectors: [], removedVectors: [], error: 'Session not found.' };

  const u = db.select().from(user).get();

  const skippedGoalVectors: string[] = [...priorSkippedGoalVectors];
  const removedVectors: string[] = [...priorRemovedVectors];

  // Load current vectors from DB (what Lenna has created so far)
  const currentVectors = db.select().from(vectors).orderBy(asc(vectors.order)).all()
    .filter(v => v.active && !removedVectors.includes(v.id))
    .map(v => ({ id: v.id, label: v.label, color: v.color }));

  const currentVectorIds = new Set(currentVectors.map(v => v.id));

  // Load anchors for current vectors
  const currentAnchors = db.select().from(anchors).all()
    .filter(a => currentVectorIds.has(a.vectorId));

  const currentDraftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, quarter), eq(goals.status, 'draft')))
    .all();

  let finalPhase = session.phase;

  let reply: string;
  try {
    reply = await chatDuringSetup(
      message,
      {
        userName:      u?.name        ?? 'You',
        dateOfBirth:   u?.dateOfBirth ?? null,
        timezone:      u?.timezone    ?? 'UTC',
        lennaTone:     (u?.lennaTone    ?? 'warm')  as 'warm' | 'neutral' | 'direct',
        lennaAutonomy: (u?.lennaAutonomy ?? 'draft') as 'suggest' | 'draft' | 'act',
        phase:         session.phase,
        quarter,
        vectors:    currentVectors.map(v => ({ id: v.id, label: v.label })),
        anchors:    currentAnchors.map(a => ({ vectorId: a.vectorId, description: a.description, targetAge: a.targetAge })),
        draftGoals: currentDraftGoals.map(g => ({ id: g.id, vectorId: g.vectorId, description: g.description, type: g.type })),
        skippedGoalVectors,
        removedVectors,
      },
      history,
      async (toolName, input) => {
        if (toolName === 'create_vector') {
          const { label, color, description } = input as { label: string; color: string; description?: string };
          const trimmed = label.trim();
          if (!trimmed) return 'Label cannot be empty.';
          const allVecs = db.select().from(vectors).all();
          const activeCount = allVecs.filter(v => v.active).length;
          if (activeCount >= 6) return `Already at ${activeCount} active vectors (cap is 6).`;
          // Slug from label with collision suffix
          let slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const existing = allVecs.map(v => v.id);
          if (existing.includes(slug)) {
            let i = 2;
            while (existing.includes(`${slug}-${i}`)) i++;
            slug = `${slug}-${i}`;
          }
          db.insert(vectors).values({
            id: slug, label: trimmed, color: color ?? '#7E8A6B',
            description: description ?? null,
            order: allVecs.length,
            active: true,
            createdVia: 'custom',
          }).run();
          return `Created vector "${trimmed}" (id: ${slug}).`;
        }

        if (toolName === 'propose_anchor') {
          const { vectorId, description, headlineMetric, targetAge, rationale } =
            input as { vectorId: string; description: string; headlineMetric?: string; targetAge?: number; rationale: string };

          // Upsert — replace if Lenna revises
          db.delete(anchors).where(eq(anchors.vectorId, vectorId)).run();
          db.insert(anchors).values({
            vectorId,
            description,
            headlineMetric: headlineMetric ?? null,
            targetAge:      targetAge ?? null,
          }).run();

          return `Anchor for ${vectorId} recorded: "${description}"`;
        }

        if (toolName === 'propose_goal') {
          const {
            vectorId, description, type, trackabilityTier, dataSource, proxyModel,
            attestationCadence, startValue, targetValue, cadencePerWeek, paceShape,
          } = input as {
            vectorId: string; description: string; type: string;
            trackabilityTier?: string; dataSource?: string; proxyModel?: string; attestationCadence?: string;
            startValue?: number; targetValue?: number; cadencePerWeek?: number; paceShape?: string;
          };

          const validTypes = ['milestone', 'metric', 'consistency'];
          if (!validTypes.includes(type)) return `Invalid type "${type}".`;

          // Dedup: skip if an identical draft already exists for this vector+description
          const dup = db.select().from(goals)
            .where(and(
              eq(goals.vectorId, vectorId),
              eq(goals.quarter, quarter),
              eq(goals.status, 'draft'),
            ))
            .all()
            .find(g => g.description === description);
          if (dup) return `Goal for ${vectorId} already drafted: "${description}"`;

          const { start: startDate, end: endDate } = quarterBounds(quarter);

          db.insert(goals).values({
            vectorId,
            quarter,
            description,
            type:                type as 'milestone' | 'metric' | 'consistency',
            status:              'draft',
            trackabilityTier:    (trackabilityTier ?? null) as 'instrumented' | 'proxy' | 'checkpoint' | 'attested' | null,
            dataSource:          dataSource          ?? null,
            proxyModel:          proxyModel          ?? null,
            attestationCadence:  attestationCadence  ?? null,
            paceShape:           (paceShape ?? 'linear') as 'linear' | 'easeIn' | 'easeOut' | 'sCurve',
            startDate,
            endDate,
            startValue:          startValue     ?? null,
            targetValue:         targetValue    ?? null,
            cadencePerWeek:      cadencePerWeek ?? null,
          }).run();

          return `Goal for ${vectorId} drafted: "${description}" (${type}, ${trackabilityTier ?? 'unclassified'})`;
        }

        if (toolName === 'remove_draft_goal') {
          const { goalId } = input as { goalId: string };
          const goal = db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.status, 'draft'))).get();
          if (!goal) return 'Draft goal not found.';
          db.delete(goals).where(eq(goals.id, goalId)).run();
          return `Draft goal "${goal.description}" removed.`;
        }

        if (toolName === 'skip_goal') {
          const { vectorId } = input as { vectorId: string; rationale: string };
          skippedGoalVectors.push(vectorId);
          return `Goal for ${vectorId} skipped this quarter.`;
        }

        if (toolName === 'remove_vector') {
          const { vectorId } = input as { vectorId: string; rationale: string };
          // Remove anchor and draft goals, then delete the vector
          db.delete(anchors).where(eq(anchors.vectorId, vectorId)).run();
          db.delete(goals)
            .where(and(eq(goals.vectorId, vectorId), eq(goals.status, 'draft')))
            .run();
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
    return { reply: '', phase: finalPhase, vectors: [], anchors: [], draftGoals: [], skippedGoalVectors: [], removedVectors: [], error: String(msg) };
  }

  // Reload state after tools ran
  const updatedVectors = db.select().from(vectors).orderBy(asc(vectors.order)).all()
    .filter(v => v.active && !removedVectors.includes(v.id));
  const updatedVectorIds = new Set(updatedVectors.map(v => v.id));
  const updatedAnchors = db.select().from(anchors).all()
    .filter(a => updatedVectorIds.has(a.vectorId));
  const updatedGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, quarter), eq(goals.status, 'draft')))
    .all();

  return {
    reply,
    phase:              finalPhase,
    vectors:            updatedVectors.map(v => ({ id: v.id, label: v.label, color: v.color })),
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
