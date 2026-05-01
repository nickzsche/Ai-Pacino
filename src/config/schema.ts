import { z } from 'zod'

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  defaultModel: z.string().default('claude-sonnet-4-6'),
  maxTokens: z.number().int().positive().default(8192),
  anthropic: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().url().default('https://api.anthropic.com'),
    })
    .default({}),
  ui: z
    .object({
      theme: z.enum(['dark', 'light']).default('dark'),
      markdown: z.boolean().default(true),
    })
    .default({}),
  logging: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      file: z.string().optional(),
    })
    .default({}),
})

export type Config = z.infer<typeof ConfigSchema>
