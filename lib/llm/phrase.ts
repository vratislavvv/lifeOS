// §3.2 — turns ranked contributors into one plain sentence for the score explanation.
// Called after recalculate(), never inside it.

import { getAI } from './client';
import type { ContributorEntry } from '@/lib/scoring/explain';

export async function phraseScore(
  operatingLevel: number,
  contributors:   ContributorEntry[],
): Promise<string> {
  if (contributors.length === 0) {
    return `${Math.round(operatingLevel)} — no goal data yet.`;
  }

  const top = contributors[0];
  const cPct   = Math.round(top.c * 100);
  const ePct   = Math.round(top.e * 100);
  const gapPct = Math.round(top.gap * 100);
  const gapStr = gapPct >= 0 ? `+${gapPct}pp` : `${gapPct}pp`;

  const lines = [
    `OL: ${Math.round(operatingLevel)}`,
    `Top contributor: ${top.vectorLabel} — c=${cPct}% vs e=${ePct}% expected, gap ${gapStr}`,
  ];

  if (contributors.length > 1) {
    const second = contributors[1];
    const g2 = Math.round(second.gap * 100);
    lines.push(`Second: ${second.vectorLabel} ${g2 >= 0 ? '+' : ''}${g2}pp`);
  }

  const prompt = `You are writing a one-line score summary for a personal operating system.

Data:
${lines.join('\n')}

Rules:
- One sentence only. Sentence case. No emoji. No hype. ≤ 15 words.
- Lead with the OL number, then the most important signal.
- If behind: name the gap plainly. If ahead: acknowledge it briefly.
- Example format: "68 — Craft at 20% vs 55% expected, ghosted for 9 days."

Write the sentence now.`;

  const response = await getAI().messages.create({
    model:       'claude-sonnet-4-6',
    max_tokens:  60,
    temperature: 0.2,
    messages:    [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text?.trim() ?? '';
  // Strip any quotes the model wraps around it
  return text.replace(/^["']|["']$/g, '');
}
