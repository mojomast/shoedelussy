import { Hono } from 'hono'
import OpenAI from 'openai'
import type { Env } from '../index'
import { getDefaultLlmConfig } from '../lib/llm'
import { STRUDEL_DOCS } from '../lib/strudel-docs/index.js'
import { validateGeneratedCode } from '../lib/aiContract'

type Variables = {}

const GENERATE_MAX_PROMPT_LENGTH = 2000
const GENERATE_MAX_PATTERN_LENGTH = 100000

export const generateRoute = new Hono<{ Bindings: Env; Variables: Variables }>()

generateRoute.post('/', async (c) => {
  try {
    // Per-IP rate limiting (protects expensive LLM API calls)
    if (c.env.RATE_LIMITER_IP) {
      const clientIP = c.req.header('cf-connecting-ip') || 'anonymous'
      const { success } = await c.env.RATE_LIMITER_IP.limit({ key: clientIP })
      
      if (!success) {
        return c.json({ 
          error: 'Rate limit exceeded. Please wait a moment before generating more patterns.',
          retryAfter: 60 
        }, 429)
      }
    }

    const { prompt, currentPattern } = await c.req.json()

    if (!prompt || typeof prompt !== 'string') {
      return c.json({ error: 'Prompt is required and must be a string' }, 400)
    }

    // Limit prompt to 2000 characters to prevent abuse
    if (prompt.length > GENERATE_MAX_PROMPT_LENGTH) {
      return c.json({ error: 'Prompt exceeds maximum length of 2,000 characters' }, 400)
    }

    // Limit currentPattern to 100k characters to prevent abuse
    if (currentPattern && typeof currentPattern === 'string' && currentPattern.length > GENERATE_MAX_PATTERN_LENGTH) {
      return c.json({ error: 'Current pattern exceeds maximum length of 100,000 characters' }, 400)
    }

    const strudelCode = await generateStrudelCode(prompt, currentPattern, c.env)

    return c.json({
      code: strudelCode,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error generating music:', error)
    return c.json({ 
      error: 'Failed to generate music',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Helper function to generate Strudel code using OpenRouter
const generateStrudelCode = async (
  prompt: string, 
  currentPattern: string | undefined, 
  env: Env
): Promise<string> => { 
  const { baseURL, apiKey, defaultHeaders, model } = getDefaultLlmConfig(env)
  const openai = new OpenAI({ baseURL, apiKey, defaultHeaders })

  const systemPrompt = `You are an expert Strudel live coding assistant.
Return valid Strudel code only.

STRICT OUTPUT RULES
- Return ONLY raw Strudel code.
- Do NOT return markdown fences.
- Do NOT return JSON.
- Do NOT explain the code.
- Do NOT echo the prompt.
- Do NOT use unsupported or invented Strudel functions.
- Do NOT use Tidal/Haskell-only syntax.
- Do NOT generate empty mini-notation like "s(\"\")".
- Do NOT use ".sometimesBy(..., x => x)" for rare events or muting.

EDIT DISCIPLINE
- If current pattern exists, return the FULL updated pattern.
- Preserve existing working structure unless the user explicitly asks for a rewrite.
- For additive requests, make the smallest targeted edit.
- For error-fixing requests, actually correct the pattern instead of repeating it.
- If an unsupported instrument, bank, or function is requested, substitute the closest safe supported option.
- For rare speech or sample events, prefer explicit "~"-based mini-notation patterns instead of fragile probability tricks.
- Keep the result concise and reviewable.

${STRUDEL_DOCS}`

  // Build the user message based on whether there's a current pattern
  let userMessage: string
  if (currentPattern && currentPattern.trim().length > 0) {
    userMessage = `Current pattern:
\`\`\`
${currentPattern}
\`\`\`

IMPORTANT: Return the FULL updated pattern based on this request.
- If they ask to add something, keep all existing tracks and add new ones.
- If they ask to change or modify something specific, ONLY CHANGE THAT ONE THING - keep everything else the same.
- If they report an ERROR or WARNING, you MUST analyze the code and fix the issue. Do NOT return the same pattern - identify what's causing the error and modify the code to resolve it.
- Always return the complete, updated pattern code - never just a fragment.
- Only return raw Strudel code, no explanations or markdown.

User request: ${prompt}
`
  } else {
    userMessage = `Generate a new Strudel pattern for: ${prompt}

Only return raw Strudel code, no explanations or markdown.`
  }

    const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.4,
  })

  const generatedCode = completion.choices[0]?.message?.content?.trim() || ''
  const validated = validateGeneratedCode(generatedCode, currentPattern)
  if ('error' in validated) {
    throw new Error(validated.error)
  }

  return validated.code
}
