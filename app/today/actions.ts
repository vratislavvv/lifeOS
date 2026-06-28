'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inputs, scores, vectors, goals } from '@/lib/db/schema';
import { extractInput } from '@/lib/llm/extract';
import { computeScore, quarterPaceNow } from '@/lib/scoring/compute';

export async function submitInput(rawText: string) {
  const text = rawText.trim();
  if (!text) return;

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const vecs = db.select().from(vectors).all();
  const quarterGoals = db.select().from(goals).where(eq(goals.quarter, quarter)).all();

  const extracted = await extractInput(text, vecs, quarterGoals);

  // Validate LLM-returned IDs against actual DB records
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

  // Recompute score from all inputs to date
  const allInputs = db.select().from(inputs).all();
  const pace = quarterPaceNow();
  const { operatingLevel, vectorBreakdown } = computeScore(vecs, allInputs, pace);

  // Replace today's score row
  db.delete(scores).where(eq(scores.date, today)).run();
  db.insert(scores).values({
    date: today,
    operatingLevel,
    vectorBreakdown,
    explanation: `${allInputs.length} input(s) · latest: ${extracted.summary}`,
  }).run();

  revalidatePath('/today');
}
