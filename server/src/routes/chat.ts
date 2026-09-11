import { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { Env } from '../index'
import { parseChatJsonResponseSafe, unsupportedSoundNames, VERIFIED_BANK_VOICES } from '../lib/aiContract'
import { getDefaultLlmConfig } from '../lib/llm'
import { STRUDEL_REFERENCE } from '../lib/strudel-docs'

const ALLOWED_MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-3.1-flash-lite-preview',
  'google/gemini-3-flash-preview',
  'openai/gpt-5.4-mini',
] as const

const MAX_CHAT_HISTORY = 20
// 8000-char / 240-line code cap leaves plenty of headroom while bounding cost.
const MAX_RESPONSE_TOKENS = 4096
const CODE_BLOCK_START = '```strudel'
const CODE_BLOCK_END = '```'

interface ChatPayload {
  project_id?: string
  messages: { role: string; content: string }[]
  current_code: string
  model?: string
  // Keep accepting the legacy 'strudelussy' mode value so older saved UI config remains valid.
  system_prompt_mode?: 'legacy-toaster' | 'shoedelussy' | 'strudelussy'
  custom_system_prompt?: string
  provider?: ChatProviderOverride
  project_meta?: { bpm?: number; key?: string; tags?: string[] }
}

interface ChatProviderOverride {
  endpoint: string
  apiKey: string
}

interface ModelsPayload {
  provider?: ChatProviderOverride
}

const bankVoiceLines = Object.entries(VERIFIED_BANK_VOICES)
  .map(([bank, voices]) => `- ${bank}: ${voices.join(', ')}`)
  .join('\n')

export const chatRoute = new Hono<{ Bindings: Env }>()

const normalizeProviderEndpoint = (endpoint: string) =>
  endpoint.trim()
    .replace(/\/(chat\/completions|models)\/?$/i, '')
    .replace(/\/+$/g, '')

const getClientOptions = (env: Env, provider?: ChatProviderOverride) => {
  if (provider?.endpoint && provider.apiKey) {
    return {
      baseURL: normalizeProviderEndpoint(provider.endpoint),
      apiKey: provider.apiKey.trim(),
      defaultHeaders: undefined,
    }
  }

  const { baseURL, apiKey, defaultHeaders } = getDefaultLlmConfig(env)
  return { baseURL, apiKey, defaultHeaders }
}

const getSelectedModel = (env: Env, payload: ChatPayload): string => {
  if (payload.provider?.endpoint && payload.provider.apiKey) {
    if (!payload.model) {
      throw new Error('A model is required when using a custom API endpoint')
    }
    return payload.model
  }

  // A deployment-configured model is authoritative for the hosted provider;
  // users who want other models supply their own endpoint + key.
  if (env.LLM_MODEL?.trim()) return env.LLM_MODEL.trim()

  return (ALLOWED_MODELS.includes((payload.model || '') as (typeof ALLOWED_MODELS)[number])
    ? payload.model
    : getDefaultLlmConfig(env).model) as (typeof ALLOWED_MODELS)[number] | string
}

chatRoute.post('/models', async (c) => {
  try {
    const payload = await c.req.json<ModelsPayload>()
    const provider = payload.provider

    if (!provider?.endpoint || !provider.apiKey) {
      return c.json({ error: 'Custom endpoint and API key are required to load models' }, 400)
    }

    const endpoint = normalizeProviderEndpoint(provider.endpoint)
    const response = await fetch(`${endpoint}/models`, {
      headers: {
        Authorization: `Bearer ${provider.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      return c.json({ error: `Failed to load models: ${errorBody || response.statusText}` }, response.status)
    }

    const data = await response.json() as { data?: Array<{ id?: string }> }
    const models = (data.data || [])
      .map((entry) => entry.id)
      .filter((id): id is string => Boolean(id))

    return c.json({ models })
  } catch (error) {
    return c.json({
      error: 'Failed to load models',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})

const buildLegacyToasterPrompt = (payload: ChatPayload) => `You are an expert Strudel live coding music assistant. Use the core documentation below to help users create and modify musical patterns.

Project metadata:
- BPM: ${payload.project_meta?.bpm ?? 'unknown'}
- Key: ${payload.project_meta?.key ?? 'unknown'}
- Tags: ${(payload.project_meta?.tags || []).join(', ') || 'none'}

Current Strudel code:

${CODE_BLOCK_START}
${payload.current_code}
${CODE_BLOCK_END}

Rules:
- Return one valid JSON object only.
- If code changes, return the full updated Strudel code.
- Keep existing structure unless the user explicitly asks for a rewrite.
- If the request is impossible in supported Strudel, explain that and set has_code_change to false.
- ".sometimesBy()" always requires two arguments: a probability and a transform, for example ".sometimesBy(0.3, rev)" or ".sometimesBy(0.2, x => x.speed(2))".
- 70+ vintage drum machines are preloaded; use .bank("RolandTR909"), .bank("OberheimDMX"), .bank("LinnDrum") etc. with .n("0 1 2") for variation.

JSON shape:
{
  "message": "brief helpful explanation",
  "code": "full updated Strudel code or empty string",
  "diff_summary": "short summary or empty string",
  "has_code_change": true
}

Core Strudel reference:
${STRUDEL_REFERENCE}`

const buildShoedelussyPrompt = (payload: ChatPayload) => `You are an expert Strudel live coding assistant.
Your ONLY job is to help the user create and refine music using supported Strudel code.
Think silently first, then output ONLY the final JSON object described below. Do not include your reasoning.

OUTPUT FORMAT (STRICT CONTRACT)

You must ALWAYS respond with EXACTLY ONE valid JSON object that matches this exact schema:

{
  "message": string,
  "code": string,
  "diff_summary": string,
  "has_code_change": boolean
}

Strict formatting rules:
- Output ONLY the JSON object, no prose before or after.
- Do NOT wrap the JSON in markdown fences.
- Use double quotes for all keys and string values.
- Do NOT add or remove fields from the schema.
- Do NOT return null for any field.
- When no code change is needed, set "code" to "", "diff_summary" to "", and "has_code_change" to false.
- When a code change is needed, "code" MUST contain the FULL updated Strudel code for the project.
- "diff_summary" should say what changed and where, e.g. "Added an offbeat closed hat and tightened the kick."
- The JSON must parse with standard JSON.parse without repairs. Escape newlines in "code" as \\n.

EXAMPLE RESPONSES

No change needed:
{"message":"That already sounds good; I left it unchanged and suggested one option.","code":"","diff_summary":"","has_code_change":false}

With a change:
{"message":"Added a syncopated closed hat and a snare backbeat.","code":"setcps(0.5)\\n$: s(\\"bd ~ bd ~\\")\\nsnare$: s(\\"~ sd ~ sd\\")\\nhat$: s(\\"hh*8\\").gain(0.5)","diff_summary":"Added a snare backbeat and offbeat hats while keeping the kick.","has_code_change":true}

CURRENT CONTEXT

Project metadata:
- BPM: ${payload.project_meta?.bpm ?? 'unknown'}
- Key: ${payload.project_meta?.key ?? 'unknown'}
- Tags: ${(payload.project_meta?.tags || []).join(', ') || 'none'}

Current Strudel code:

${CODE_BLOCK_START}
${payload.current_code}
${CODE_BLOCK_END}

Use the conversation history plus this code to understand what the user is iterating on.
Earlier assistant turns may appear as plain text for readability; ALWAYS reply with the JSON object regardless.
Make SMALL, incremental edits on top of the existing code.
Only rewrite the entire pattern or project structure when the user explicitly asks for a full rewrite.

CRITICAL RULES

- Closed world rule: only use constructs already present in current_code, explicitly listed here, or found in the Strudel reference below.
- Generate valid Strudel syntax only. Never output Tidal/Haskell operators or syntax.
- Never truncate or omit code.
- Never use placeholder comments.
- Prefer incremental changes.
- Unless the user explicitly asks for a rewrite, preserve structure, tracks, BPM, key, and recognizable motifs.
- Never use unsupported methods: .bend(), .stutter(), .bounce(), .pingpong(), .trancegate(), .rlpf(), .acidenv().
- Never use await in Strudel code.
- Never return huge rewrites for small requests.
- Never claim to change code unless the returned code actually changes.
- If the user asks for a partial edit, implement that exact edit and leave unrelated code unchanged.
- If a request cannot be safely satisfied with supported Strudel code, explain the limitation in message, choose the closest safe alternative, or return has_code_change false.
- If you are unsure whether a function, sound, bank, or track form exists, do not use it.

SUPPORTED BEHAVIOR

- Favor conservative, commonly supported Strudel functions like s, note, n, sound, gain, room, delay, slow, fast, stack, cat, mini, color, scale.
- For drums, prefer mini-notation inside s("...") and Euclidean rhythms such as s("bd(3,16)").bank("RolandTR808").
- ".sometimesBy()" always requires two arguments: probability first, transform second. Never call ".sometimesBy()" with only one input.
- Never use ".sometimesBy(..., x => x)" for rare events or muting. It is a no-op.
- Never generate empty mini-notation like "s(\"\")", "n(\"\")", or "mini(\"\")".
- For rare one-shot speech/sample events, prefer an explicit pattern with "~", for example "s(\"blong_is_a_kitty_cat ~ ~ ~ ~ ~ ~ ~ ~ ~\")", instead of inventing clever probability tricks.
- Use .mask("<0 1 1 1>") for arrangement changes.
- Use .jux(rev) for subtle stereo interest on melodic patterns.
- Use .off(1/8, rev) for an echo-style variation. Never use arithmetic like .add()/.mul()/.sub() inside .off() on note() or n() patterns; use rev, gain, or speed transforms instead.
- Use .every(4, x => x.rev()) for periodic variation.
- Use .n("0 1 2 3") to pick variations when a sound has multiple samples (drums, banks, piano, wavetables). This adds a lot of life for free.
- For multi-track code, prefer named $ tracks like drums$: bass$: chords$: lead$: when creating or rewriting stacked arrangements.

LOADED SAMPLE PACKS (already available; no samples() call needed)

- Classic drum one-shots: bd, sd, hh, oh, cp, rim, cr, rd, ht, mt, lt, cb, tb, sh, perc, misc.
- Vintage drum machines via .bank("Name"): 70+ banks (see the verified list below). Use .n(...) for variations.
- Breakbeats and loops: breaks125, breaks152, breaks157, breaks165, amencutup, and amen1 / amen2 / amen3, plus the clean-breaks loops.
- 808/909 one-shots: 808bd, 808sd, 808cy, 808hh, 909.
- Piano: s("piano").n("<0 3 5>") or combine with note().
- Wavetables: wt_digital, wt_digital_bad_day, wt_vgame (use .s("wt_digital").n("<0 1 2>")).
- Soundfonts (realistic GM instruments, gm_ prefix): gm_epiano1, gm_acoustic_bass, gm_lead_1_square, gm_string_ensemble_1, gm_glockenspiel, gm_flute, gm_pad_warm, and many more.
- Other loaded packs: Fox percussion (fclap, fdarkkick, fbeep, ftriangle, ftoms, fscrap, fsnap), pad synth (swpad), VCSL orchestral samples, mridangam, EmuSP12, uzu-drumkit.
- Synthesizers: sawtooth, square, triangle, sine, plus ZZFX chip sounds z_sawtooth, z_square, z_noise.

To load extra packs beyond these, put samples() on its own line at the very TOP of the code (before any pattern), for example samples('bubo:fox') or samples('github:tidalcycles/dirt-samples').

VERIFIED BANK + VOICE COMBINATIONS

These banks are loaded and safe to use with .bank(). Prefer the listed voice names (matching samples exist; other voices may not):
${bankVoiceLines}

Unsupported sound names:
- Never use: ${unsupportedSoundNames.join(', ')}
- If the user asks for unsupported percussion or any percussion not in the verified list, map it to the nearest valid voice and explain the substitution in message.

SIZE + EDIT DISCIPLINE

- Keep generated code under 240 lines.
- Keep generated code under 8000 characters.
- For simple edits, prefer changing one track or one section instead of the whole file.
- If the current code is already close, preserve comments, section markers, track names, and stable working material.

DECISION LADDER

1. If the request can be satisfied with supported Strudel code, make the smallest clean change.
2. If only part of the request is possible, make the closest safe change and explain the substitution.
3. If the best response is advice rather than code, return has_code_change false with empty code and diff_summary fields.
4. If the current code is empty or invalid, produce a minimal safe pattern rather than risky or speculative code.
5. If the user reports an error or warning, fix the likely cause in the code instead of merely describing it.

Condensed Strudel reference:
${STRUDEL_REFERENCE}`

const buildSystemPrompt = (payload: ChatPayload) =>
  [
    payload.system_prompt_mode === 'legacy-toaster'
      ? buildLegacyToasterPrompt(payload)
      : buildShoedelussyPrompt(payload),
    payload.custom_system_prompt?.trim()
      ? `\n\nCUSTOM SYSTEM PROMPT OVERRIDE\n\nApply these additional instructions on top of the selected base prompt. If they conflict with user safety or supported Strudel behavior, prefer the safer supported behavior.\n\n${payload.custom_system_prompt.trim()}`
      : '',
  ].join('')

chatRoute.post('/', async (c) => {
  try {
    if (c.env.RATE_LIMITER_IP) {
      const clientIP = c.req.header('cf-connecting-ip') || 'anonymous'
      const { success } = await c.env.RATE_LIMITER_IP.limit({ key: clientIP })

      if (!success) {
        return c.json({ error: 'Rate limit exceeded. Please wait a moment before sending more prompts.' }, 429)
      }
    }

    const payload = await c.req.json<ChatPayload>()
    if (!Array.isArray(payload.messages) || typeof payload.current_code !== 'string') {
      return c.json({ error: 'messages and current_code are required' }, 400)
    }

    const openai = new OpenAI(getClientOptions(c.env, payload.provider))
    const selectedModel = getSelectedModel(c.env, payload)

    const systemExtras = payload.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content.trim())
      .filter(Boolean)
      .slice(-MAX_CHAT_HISTORY)

    const recentMessages = payload.messages
      .filter((message) => message.role !== 'system')
      .slice(-MAX_CHAT_HISTORY)

    const systemPrompt = [
      buildSystemPrompt(payload),
      systemExtras.length > 0 ? `\n\nCONVERSATION SUMMARY\n\n${systemExtras.join('\n\n')}` : '',
    ].join('')

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })) as ChatCompletionMessageParam[],
    ]

    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')
    c.header('X-Accel-Buffering', 'no')

    return streamText(c, async (stream) => {
      // Flush an initial comment immediately so the client and any intermediate
      // proxy see activity before the model produces its first token.
      await stream.write(': connected\n\n')
      const heartbeatId = setInterval(() => {
        void stream.write(': keep-alive\n\n')
      }, 10000)

      try {
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          temperature: 0.4,
          max_tokens: MAX_RESPONSE_TOKENS,
          messages,
          stream: true,
        })

        let content = ''

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content ?? ''
          if (!delta) continue
          content += delta
          await stream.write(`data: ${JSON.stringify({ type: 'chunk', chunk: delta })}\n\n`)
        }

        if (!content.trim()) {
          await stream.write(`data: ${JSON.stringify({ type: 'error', error: 'LLM returned an empty response' })}\n\n`)
          await stream.write('data: [DONE]\n\n')
          return
        }

        const parsed = parseChatJsonResponseSafe(content.trim(), payload.current_code)
        if (!parsed.ok) {
          // Signal a contract violation so the client can retry once instead of
          // treating a malformed reply as a successful answer.
          await stream.write(`data: ${JSON.stringify({ type: 'contract_error', error: `Invalid response: ${parsed.message}` })}\n\n`)
          await stream.write('data: [DONE]\n\n')
          return
        }

        await stream.write(`data: ${JSON.stringify({ type: 'done', response: parsed.response })}\n\n`)
        await stream.write('data: [DONE]\n\n')
      } catch (error) {
        await stream.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Streaming chat failed' })}\n\n`)
        await stream.write('data: [DONE]\n\n')
      } finally {
        clearInterval(heartbeatId)
      }
    })
  } catch (error) {
    console.error('Error handling chat:', error)
    return c.json({
      error: 'Failed to process chat request',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})
