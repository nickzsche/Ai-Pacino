import type { Config } from '../config/schema'

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'Anthropic API key not found.\n' +
        'Set ANTHROPIC_API_KEY environment variable, or add\n' +
        '  { "anthropic": { "apiKey": "sk-..." } }\n' +
        'to ~/.config/aipacino/config.json or .aipacino/config.json in your project.',
    )
    this.name = 'MissingApiKeyError'
  }
}

export const resolveAnthropicKey = (config: Config): string => {
  const key = config.anthropic.apiKey
  if (!key || key.trim().length === 0) {
    throw new MissingApiKeyError()
  }
  return key
}
