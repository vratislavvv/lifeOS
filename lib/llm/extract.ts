import { ai } from './client';

type ExtractedInput = {
  vectorId: string;
  goalId: string | null;
  progressDelta: number;
  confidence: number;
  summary: string;
};

export async function extractInput(
  rawText: string,
  vectors: { id: string; label: string }[],
  goals: { id: string; vectorId: string; description: string }[]
): Promise<ExtractedInput> {
  const vectorList = vectors.map(v => {
    const vGoals = goals.filter(g => g.vectorId === v.id);
    const goalLines = vGoals
      .map(g => `    goal: "${g.description}" (id: ${g.id})`)
      .join('\n');
    return `- ${v.id} (${v.label})${goalLines ? '\n' + goalLines : ''}`;
  }).join('\n');

  const validIds = vectors.map(v => v.id).join(', ');

  const prompt = `Extract structured data from this life journal entry.

Active vectors and quarter goals:
${vectorList}

Entry: "${rawText}"

Respond with valid JSON only, no other text:
{
  "vectorId": "<one of: ${validIds}>",
  "goalId": "<matching goal id or null>",
  "progressDelta": <0.0-1.0, fraction of the quarter goal this input represents>,
  "confidence": <0.0-1.0>,
  "summary": "<10 words max>"
}

progressDelta calibration:
- One training session toward a fitness goal ≈ 0.05–0.15
- One focused work session on a project ≈ 0.05–0.15
- Completing one book toward a 12-book goal ≈ 0.08
- One night of a daily consistency habit ≈ 0.01–0.02
- Completing a major milestone ≈ 0.3–0.5`;

  const resp = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '{}';

  try {
    const parsed = JSON.parse(text) as Partial<ExtractedInput>;
    return {
      vectorId: parsed.vectorId ?? vectors[0]?.id ?? 'craft',
      goalId: parsed.goalId ?? null,
      progressDelta: Math.min(Math.max(parsed.progressDelta ?? 0.05, 0), 1),
      confidence: Math.min(Math.max(parsed.confidence ?? 0.5, 0), 1),
      summary: parsed.summary ?? rawText.slice(0, 60),
    };
  } catch {
    return {
      vectorId: vectors[0]?.id ?? 'craft',
      goalId: null,
      progressDelta: 0.05,
      confidence: 0.3,
      summary: rawText.slice(0, 60),
    };
  }
}
