'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, anchors, goals, sessions } from '@/lib/db/schema';
import { computeQuarterReport } from '@/lib/scoring/quarterReport';
import { chatDuringReview, type ChatMessage } from '@/lib/llm/reviewChat';
import { quarterBounds, nextQuarterOf } from '@/lib/dates';

export { nextQuarterOf };

// ── TurnResult ────────────────────────────────────────────────────────────────

export type TurnResult = {
  reply:              string;
  phase:              string;
  draftGoals:         { id: string; vectorId: string; description: string; type: string; startValue: number | null; targetValue: number | null; cadencePerWeek: number | null; paceShape: string }[];
  skippedGoalVectors: string[];
  removedVectors:     string[];
  error?:             string;
};

// ── 1. Chat turn ──────────────────────────────────────────────────────────────

export async function reviewSessionTurn(
  message:         string,
  history:         ChatMessage[],
  sessionId:       string,
  closedQuarter:   string,
  nextQuarter:     string,
  selectedVectors: { id: string; label: string }[],
  priorSkipped:    string[] = [],
  priorRemoved:    string[] = [],
): Promise<TurnResult> {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return { reply: '', phase: 'report', draftGoals: [], skippedGoalVectors: [], removedVectors: [], error: 'Session not found.' };

  const u = db.select().from(user).get();

  const currentDraftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, nextQuarter), eq(goals.status, 'draft')))
    .all();

  const report = session.report as ReturnType<typeof computeQuarterReport> | null;
  if (!report) return { reply: '', phase: session.phase, draftGoals: [], skippedGoalVectors: [], removedVectors: [], error: 'Report not found in session.' };

  let finalPhase = session.phase;
  const skippedGoalVectors: string[] = [...priorSkipped];
  const removedVectors:     string[] = [...priorRemoved];

  let reply: string;
  try {
    reply = await chatDuringReview(
      message,
      {
        userName:           u?.name     ?? 'You',
        timezone:           u?.timezone ?? 'UTC',
        lennaTone:          (u?.lennaTone    ?? 'warm')  as 'warm' | 'neutral' | 'direct',
        lennaAutonomy:      (u?.lennaAutonomy ?? 'draft') as 'suggest' | 'draft' | 'act',
        phase:              session.phase,
        closedQuarter,
        nextQuarter,
        vectors:            selectedVectors.filter(v => !removedVectors.includes(v.id)),
        draftGoals:         currentDraftGoals.map(g => ({ vectorId: g.vectorId, description: g.description, type: g.type })),
        skippedGoalVectors,
        removedVectors,
        report,
      },
      history,
      async (toolName, input) => {
        if (toolName === 'advance_phase') {
          const { phase } = input as { phase: 'discuss' | 'replan' | 'commit' };
          db.update(sessions).set({ phase }).where(eq(sessions.id, sessionId)).run();
          finalPhase = phase;
          return `Session advanced to ${phase} phase.`;
        }

        if (toolName === 'propose_goal') {
          const { vectorId, description, type, startValue, targetValue, cadencePerWeek, paceShape } =
            input as {
              vectorId: string; description: string; type: string;
              startValue?: number; targetValue?: number; cadencePerWeek?: number;
              paceShape?: string; rationale: string;
            };

          const validTypes = ['milestone', 'metric', 'consistency'];
          if (!validTypes.includes(type)) return `Invalid type "${type}".`;

          const { start: startDate, end: endDate } = quarterBounds(nextQuarter);

          const existing = db.select().from(goals)
            .where(and(eq(goals.quarter, nextQuarter), eq(goals.vectorId, vectorId), eq(goals.status, 'draft')))
            .get();
          if (existing) db.delete(goals).where(eq(goals.id, existing.id)).run();

          db.insert(goals).values({
            vectorId,
            quarter:        nextQuarter,
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
          const { vectorId } = input as { vectorId: string };
          if (!skippedGoalVectors.includes(vectorId)) skippedGoalVectors.push(vectorId);
          return `Goal for ${vectorId} skipped this quarter.`;
        }

        if (toolName === 'remove_vector') {
          const { vectorId } = input as { vectorId: string };
          const existing = db.select().from(anchors).where(eq(anchors.vectorId, vectorId)).get();
          if (existing) db.delete(anchors).where(eq(anchors.id, existing.id)).run();
          db.delete(goals).where(and(eq(goals.vectorId, vectorId), eq(goals.status, 'draft'))).run();
          db.delete(vectors).where(eq(vectors.id, vectorId)).run();
          removedVectors.push(vectorId);
          return `${vectorId} removed from profile.`;
        }

        return 'Unknown tool.';
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { reply: '', phase: finalPhase, draftGoals: [], skippedGoalVectors, removedVectors, error: String(msg) };
  }

  const updatedGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, nextQuarter), eq(goals.status, 'draft')))
    .all();

  return {
    reply,
    phase:              finalPhase,
    draftGoals:         updatedGoals.map(g => ({
      id: g.id, vectorId: g.vectorId, description: g.description, type: g.type,
      startValue: g.startValue, targetValue: g.targetValue,
      cadencePerWeek: g.cadencePerWeek, paceShape: g.paceShape,
    })),
    skippedGoalVectors,
    removedVectors,
  };
}

// ── 2. Commit ─────────────────────────────────────────────────────────────────

export async function commitReviewSession(sessionId: string): Promise<void> {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return;

  const nextQuarter  = session.quarter;
  const report       = session.report as { quarter?: string } | null;
  const closedQuarter = report?.quarter;

  // Close prior quarter's active goals
  if (closedQuarter) {
    const priorGoals = db.select().from(goals)
      .where(and(eq(goals.quarter, closedQuarter), eq(goals.status, 'active')))
      .all();
    priorGoals.forEach(g => {
      db.update(goals).set({ status: 'completed' }).where(eq(goals.id, g.id)).run();
    });
  }

  // Activate next quarter's draft goals
  const draftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, nextQuarter), eq(goals.status, 'draft')))
    .all();
  draftGoals.forEach(g => {
    db.update(goals).set({ status: 'active' }).where(eq(goals.id, g.id)).run();
  });

  // Close the session
  db.update(sessions).set({
    status:           'complete',
    phase:            'commit',
    completedAt:      new Date(),
    committedGoalIds: draftGoals.map(g => g.id),
  }).where(eq(sessions.id, sessionId)).run();

  redirect('/today');
}
