'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user, vectors, anchors, goals, sessions } from '@/lib/db/schema';
import { chatDuringReplan, type ChatMessage } from '@/lib/llm/replanChat';
import { todayStr, quarterBounds } from '@/lib/dates';

export type ReplanTurnResult = {
  reply:              string;
  phase:              string;
  abandonedGoalIds:   string[];
  draftGoals: {
    id:             string;
    vectorId:       string;
    description:    string;
    type:           string;
    startValue:     number | null;
    targetValue:    number | null;
    cadencePerWeek: number | null;
    paceShape:      string;
  }[];
  skippedGoalVectors: string[];
  removedVectors:     string[];
  error?:             string;
};

export async function replanSessionTurn(
  message:         string,
  history:         ChatMessage[],
  sessionId:       string,
  currentQuarter:  string,
  selectedVectors: { id: string; label: string }[],
  priorAbandoned:  string[] = [],
  priorSkipped:    string[] = [],
  priorRemoved:    string[] = [],
): Promise<ReplanTurnResult> {
  const empty: ReplanTurnResult = {
    reply: '', phase: 'discuss', abandonedGoalIds: [], draftGoals: [],
    skippedGoalVectors: [], removedVectors: [],
  };

  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return { ...empty, error: 'Session not found.' };

  const u = db.select().from(user).get();

  // Load active goals at the start of the turn — used for abandon_goal validation
  const activeGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, currentQuarter), eq(goals.status, 'active')))
    .all();

  const currentDraftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, currentQuarter), eq(goals.status, 'draft')))
    .all();

  let finalPhase            = session.phase;
  const abandonedGoalIds:   string[] = [...priorAbandoned];
  const skippedGoalVectors: string[] = [...priorSkipped];
  const removedVectors:     string[] = [...priorRemoved];

  let reply: string;
  try {
    reply = await chatDuringReplan(
      message,
      {
        userName:        u?.name     ?? 'You',
        timezone:        u?.timezone ?? 'UTC',
        lennaTone:       (u?.lennaTone    ?? 'warm')  as 'warm' | 'neutral' | 'direct',
        lennaAutonomy:   (u?.lennaAutonomy ?? 'draft') as 'suggest' | 'draft' | 'act',
        phase:           session.phase,
        currentQuarter,
        vectors:         selectedVectors.filter(v => !removedVectors.includes(v.id)),
        currentGoals:    activeGoals.map(g => ({
          id: g.id, vectorId: g.vectorId, description: g.description, type: g.type,
        })),
        draftGoals:      currentDraftGoals.map(g => ({
          vectorId: g.vectorId, description: g.description, type: g.type,
        })),
        abandonedGoalIds,
        skippedGoalVectors,
        removedVectors,
      },
      history,
      async (toolName, input) => {
        if (toolName === 'advance_phase') {
          const { phase } = input as { phase: 'replan' | 'commit' };
          db.update(sessions).set({ phase }).where(eq(sessions.id, sessionId)).run();
          finalPhase = phase;
          return `Session advanced to ${phase} phase.`;
        }

        if (toolName === 'abandon_goal') {
          const { goalId } = input as { goalId: string; rationale: string };
          const goal = activeGoals.find(g => g.id === goalId);
          if (!goal) return 'Goal not found.';
          db.update(goals).set({ status: 'abandoned' }).where(eq(goals.id, goalId)).run();
          if (!abandonedGoalIds.includes(goalId)) abandonedGoalIds.push(goalId);
          return `Goal "${goal.description}" abandoned.`;
        }

        if (toolName === 'propose_goal') {
          const { vectorId, description, type, startValue, targetValue, cadencePerWeek, paceShape } =
            input as {
              vectorId: string; description: string; type: string;
              startValue?: number; targetValue?: number;
              cadencePerWeek?: number; paceShape?: string; rationale: string;
            };

          const validTypes = ['milestone', 'metric', 'consistency'];
          if (!validTypes.includes(type)) return `Invalid type "${type}".`;

          const today   = todayStr();
          const endDate = quarterBounds(currentQuarter).end;

          // Replace any existing draft for this vector
          const existing = db.select().from(goals)
            .where(and(eq(goals.quarter, currentQuarter), eq(goals.vectorId, vectorId), eq(goals.status, 'draft')))
            .get();
          if (existing) db.delete(goals).where(eq(goals.id, existing.id)).run();

          db.insert(goals).values({
            vectorId,
            quarter:        currentQuarter,
            description,
            type:           type as 'milestone' | 'metric' | 'consistency',
            status:         'draft',
            paceShape:      (paceShape ?? 'linear') as 'linear' | 'easeIn' | 'easeOut' | 'sCurve',
            startDate:      today,
            endDate,
            startValue:     startValue     ?? null,
            targetValue:    targetValue    ?? null,
            cadencePerWeek: cadencePerWeek ?? null,
          }).run();

          return `Goal for ${vectorId} drafted: "${description}" (${type}).`;
        }

        if (toolName === 'skip_goal') {
          const { vectorId } = input as { vectorId: string; rationale: string };
          if (!skippedGoalVectors.includes(vectorId)) skippedGoalVectors.push(vectorId);
          return `${vectorId} will sit out the rest of this quarter.`;
        }

        if (toolName === 'remove_vector') {
          const { vectorId } = input as { vectorId: string; rationale: string };
          const anchor = db.select().from(anchors).where(eq(anchors.vectorId, vectorId)).get();
          if (anchor) db.delete(anchors).where(eq(anchors.id, anchor.id)).run();
          db.delete(goals).where(and(eq(goals.vectorId, vectorId), eq(goals.status, 'draft'))).run();
          db.delete(vectors).where(eq(vectors.id, vectorId)).run();
          if (!removedVectors.includes(vectorId)) removedVectors.push(vectorId);
          return `${vectorId} removed from profile.`;
        }

        return 'Unknown tool.';
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { ...empty, phase: finalPhase, abandonedGoalIds, skippedGoalVectors, removedVectors, error: String(msg) };
  }

  const updatedDraftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, currentQuarter), eq(goals.status, 'draft')))
    .all();

  return {
    reply,
    phase: finalPhase,
    abandonedGoalIds,
    draftGoals: updatedDraftGoals.map(g => ({
      id: g.id, vectorId: g.vectorId, description: g.description, type: g.type,
      startValue: g.startValue, targetValue: g.targetValue,
      cadencePerWeek: g.cadencePerWeek, paceShape: g.paceShape,
    })),
    skippedGoalVectors,
    removedVectors,
  };
}

export async function commitReplanSession(sessionId: string): Promise<void> {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return;

  const currentQuarter = session.quarter;

  const draftGoals = db.select().from(goals)
    .where(and(eq(goals.quarter, currentQuarter), eq(goals.status, 'draft')))
    .all();

  draftGoals.forEach(g => {
    db.update(goals).set({ status: 'active' }).where(eq(goals.id, g.id)).run();
  });

  db.update(sessions).set({
    status:           'complete',
    phase:            'commit',
    completedAt:      new Date(),
    committedGoalIds: draftGoals.map(g => g.id),
  }).where(eq(sessions.id, sessionId)).run();

  redirect('/today');
}
