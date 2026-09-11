import type { Env } from '../index'

export const DEFAULT_LLM_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_LLM_MODEL = 'google/gemini-2.5-flash'

export interface DefaultLlmConfig {
  baseURL: string
  apiKey: string
  model: string
  defaultHeaders?: Record<string, string>
}

// Resolves the deployment-level default LLM provider. `LLM_*` vars win, with
// the legacy OpenRouter vars kept as a fallback for existing deployments.
export const getDefaultLlmConfig = (env: Env): DefaultLlmConfig => {
  const baseURL = env.LLM_BASE_URL?.trim() || DEFAULT_LLM_BASE_URL
  const apiKey = env.LLM_API_KEY?.trim() || env.OPENROUTER_API_KEY || ''
  const model = env.LLM_MODEL?.trim() || env.OPENROUTER_MODEL || DEFAULT_LLM_MODEL

  const defaultHeaders = /openrouter\.ai/i.test(baseURL)
    ? {
        'HTTP-Referer': env.APP_URL || 'http://localhost:5173',
        'X-Title': 'strudelussy chat',
      }
    : undefined

  return { baseURL, apiKey, model, defaultHeaders }
}
