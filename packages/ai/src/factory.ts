import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from './providers/anthropic';
import { HeuristicProvider } from './providers/heuristic';
import type { AiProvider, AiProviderKind } from './types';

/** Builds the assistant an organization configured; never falls back silently. */
export function createProvider(input: {
  kind: AiProviderKind;
  model?: string | null;
  apiKey?: string | null;
}): AiProvider {
  if (input.kind === 'ANTHROPIC') {
    if (!input.apiKey) {
      throw new Error('This organization has no Anthropic API key configured');
    }
    return new AnthropicProvider({
      apiKey: input.apiKey,
      model: input.model ?? DEFAULT_ANTHROPIC_MODEL,
    });
  }
  return new HeuristicProvider();
}
