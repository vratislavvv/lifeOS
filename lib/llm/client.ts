import Anthropic from '@anthropic-ai/sdk';

let _ai: Anthropic | null = null;

export function getAI(): Anthropic {
  if (!_ai) _ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _ai;
}
