export interface AIResponseContract {
  message: string
  code: string
  diff_summary: string
  has_code_change: boolean
}

export const MAX_CODE_LENGTH = 8000
export const MAX_CODE_LINES = 240

const UNSUPPORTED_METHOD_NAMES = ['bend', 'stutter', 'bounce', 'pingpong', 'trancegate', 'rlpf', 'acidenv'] as const
const UNSUPPORTED_METHOD_PATTERN = new RegExp(`\\.(${UNSUPPORTED_METHOD_NAMES.join('|')})\\s*\\(`, 'g')
// These are only used with `.test()`. They must NOT be global, otherwise the
// shared `lastIndex` makes `.test()` alternate between true/false across calls.
const SOMETIMES_BY_SINGLE_ARG_PATTERN = /\.sometimesBy\s*\(\s*[^,()]+\s*\)/
const EMPTY_PATTERN_CALL_PATTERN = /\b(?:s|n|note|sound|mini)\(\s*(["'])\s*\1\s*\)/

export const unsupportedSoundNames = ['chirp', 'bongo', 'conga', 'timbale', 'cowbell', 'tambourine', 'clap2']

// Canonical bank name -> available voices, derived from the tidal-drum-machines
// pack that the editor loads. Keep in sync with the sample loading in
// ui/src/components/StrudelEditor.tsx.
const VERIFIED_BANK_VOICE_DATA = `
AJKPercusyn:bd,sd,ht,cb
AkaiLinn:bd,sd,hh,oh,cp,cr,rd,lt,mt,ht,cb,tb,sh
AkaiMPC60:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,perc,misc
AkaiXR10:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh,perc,misc
AlesisHR16:bd,sd,hh,oh,cp,rim,lt,ht,sh,perc
AlesisSR16:bd,sd,hh,oh,cp,cr,rd,rim,cb,tb,sh,perc,misc
BossDR110:bd,sd,hh,oh,cp,cr,rd
BossDR220:bd,sd,hh,oh,cp,cr,rd,lt,mt,ht,perc
BossDR55:bd,sd,hh,rim
BossDR550:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh,perc,misc
CasioRZ1:bd,sd,hh,cp,cr,rd,rim,lt,mt,ht,cb
CasioSK1:bd,sd,hh,oh,mt,ht
CasioVL1:bd,sd,hh
DoepferMS404:bd,sd,hh,oh,lt
EmuDrumulator:bd,sd,hh,oh,cp,cr,rim,lt,mt,ht,cb,perc
EmuModular:bd,perc,misc
EmuSP12:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,perc,misc
KorgDDM110:bd,sd,hh,oh,cp,cr,rim,lt,ht
KorgKPR77:bd,sd,hh,oh,cp
KorgKR55:bd,sd,hh,oh,cr,rim,ht,cb,perc
KorgKRZ:bd,sd,hh,oh,cr,rd,lt,ht,misc,fx
KorgM1:bd,sd,hh,oh,cp,cr,rd,rim,mt,ht,cb,tb,sh,perc,misc
KorgMinipops:bd,sd,hh,oh,misc
KorgPoly800:bd
KorgT3:bd,sd,hh,oh,cp,rim,sh,perc,misc
Linn9000:bd,sd,hh,oh,cr,rd,rim,lt,mt,ht,cb,tb,perc
LinnDrum:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh,perc
LinnLM1:bd,sd,hh,oh,cp,rim,lt,ht,cb,tb,sh,perc
LinnLM2:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh
MFB512:bd,sd,hh,oh,cp,cr,lt,mt,ht
MPC1000:bd,sd,hh,oh,cp,sh,perc
MoogConcertMateMG1:bd,sd
OberheimDMX:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,tb,sh
RhodesPolaris:bd,sd,misc
RhythmAce:bd,sd,hh,oh,lt,ht,perc
RolandCompurhythm1000:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,perc
RolandCompurhythm78:bd,sd,hh,oh,cb,tb,perc,misc
RolandCompurhythm8000:bd,sd,hh,oh,cp,cr,rim,lt,mt,ht,cb,perc
RolandD110:bd,sd,hh,oh,cr,rd,rim,lt,cb,tb,sh,perc
RolandD70:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,cb,sh,perc
RolandDDR30:bd,sd,lt,ht
RolandJD990:bd,sd,hh,oh,cp,cr,rd,lt,mt,ht,cb,tb,perc,misc
RolandMC202:bd,ht,perc
RolandMC303:bd,sd,hh,oh,cp,rd,rim,lt,mt,ht,cb,tb,sh,perc,misc,fx
RolandMT32:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh,perc
RolandR8:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh,perc
RolandS50:bd,sd,oh,cp,cr,rd,lt,mt,ht,cb,tb,sh,perc,misc
RolandSH09:bd
RolandSystem100:bd,sd,hh,oh,perc,misc
RolandTR505:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,perc
RolandTR606:bd,sd,hh,oh,cr,lt,ht
RolandTR626:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh,perc
RolandTR707:bd,sd,hh,oh,cp,cr,rim,lt,mt,ht,cb,tb
RolandTR727:sh,perc
RolandTR808:bd,sd,hh,oh,cp,cr,rim,lt,mt,ht,cb,sh,perc
RolandTR909:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht
SakataDPM48:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,sh,perc
SequentialCircuitsDrumtracks:bd,sd,hh,oh,cp,cr,rd,rim,ht,cb,tb,sh
SequentialCircuitsTom:bd,sd,hh,oh,cp,cr,ht
SergeModular:bd,perc,misc
SimmonsSDS400:sd,lt,mt,ht
SimmonsSDS5:bd,sd,hh,oh,rim,lt,mt,ht
SoundmastersR88:bd,sd,hh,oh,cr
UnivoxMicroRhythmer12:bd,sd,hh,oh
ViscoSpaceDrum:bd,sd,hh,oh,rim,lt,mt,ht,cb,perc,misc
XdrumLM8953:bd,sd,hh,oh,cr,rd,rim,lt,mt,ht,tb
YamahaRM50:bd,sd,hh,oh,cp,cr,rd,lt,mt,ht,cb,tb,sh,perc,misc
YamahaRX21:bd,sd,hh,oh,cp,cr,lt,mt,ht
YamahaRX5:bd,sd,hh,oh,rim,lt,cb,tb,sh,fx
YamahaRY30:bd,sd,hh,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh,perc,misc
YamahaTG33:bd,sd,oh,cp,cr,rd,rim,lt,mt,ht,cb,tb,sh,perc,misc,fx
`

const parseBankVoices = (data: string): Record<string, string[]> => {
  const banks: Record<string, string[]> = {}
  for (const line of data.trim().split('\n')) {
    const [bank, voices] = line.split(':')
    if (!bank || !voices) continue
    banks[bank.trim()] = voices.split(',').map((voice) => voice.trim()).filter(Boolean)
  }
  return banks
}

export const VERIFIED_BANK_VOICES: Record<string, string[]> = parseBankVoices(VERIFIED_BANK_VOICE_DATA)

const BANK_NAME_BY_LOWER = new Map(
  Object.keys(VERIFIED_BANK_VOICES).map((bank) => [bank.toLowerCase(), bank]),
)

interface SanitizedCodeResult {
  code: string
  substitutions: string[]
  blockingIssue: string | null
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, '\n')

export const normalizeCodeForComparison = (value: string) => normalizeNewlines(value).trim()

export const stripMarkdownFences = (value: string) => value
  .replace(/```(?:json|javascript|js|strudel)?\n?/gi, '')
  .replace(/```\n?/g, '')

export const extractFirstJsonObject = (value: string): string | null => {
  let start = -1
  let depth = 0
  let inString = false
  let isEscaped = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]

    if (start === -1) {
      if (char === '{') {
        start = index
        depth = 1
      }
      continue
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }

      if (char === '\\') {
        isEscaped = true
        continue
      }

      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return value.slice(start, index + 1)
      }
    }
  }

  return null
}

const dedupe = (items: string[]) => Array.from(new Set(items))

const findNoOpSometimesByCalls = (code: string): string[] => {
  const matches: string[] = []
  const pattern = /\.sometimesBy\s*\(\s*[^,]+,\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\)|([A-Za-z_$][\w$]*))\s*=>\s*([A-Za-z_$][\w$]*)\s*\)/g

  for (const match of code.matchAll(pattern)) {
    const parameter = match[1] || match[2]
    const returned = match[3]
    if (parameter && parameter === returned) {
      matches.push(match[0])
    }
  }

  return dedupe(matches)
}

const buildRareMiniPattern = (token: string, slots = 10) => [token, ...Array.from({ length: Math.max(1, slots - 1) }, () => '~')].join(' ')

const repairRareEventPatterns = (input: string): { code: string; substitutions: string[] } => {
  let code = input
  const substitutions: string[] = []

  code = code.replace(
    /s\(\s*""\s*\)\.sometimesBy\(\s*(0?\.\d+)\s*,\s*[A-Za-z_$][\w$]*\s*=>\s*s\(\s*"([^"\n]+)"\s*\)\s*\)/g,
    (_match, probabilityText: string, token: string) => {
      const probability = Number.parseFloat(probabilityText)
      const slots = Number.isFinite(probability) && probability > 0 ? Math.max(2, Math.round(1 / probability)) : 10
      substitutions.push(`Repaired invalid rare-event pattern into explicit mini-notation for \`${token}\`.`)
      return `s("${buildRareMiniPattern(token, slots)}")`
    },
  )

  code = code.replace(
    /s\(\s*"([^"\n]+)"\s*\)\.sometimesBy\(\s*(0?\.\d+)\s*,\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\)|([A-Za-z_$][\w$]*))\s*=>\s*([A-Za-z_$][\w$]*)\s*\)/g,
    (match, token: string, probabilityText: string, leftA: string | undefined, leftB: string | undefined, returned: string) => {
      const parameter = leftA || leftB
      if (!parameter || parameter !== returned) return match
      const probability = Number.parseFloat(probabilityText)
      const slots = Number.isFinite(probability) && probability > 0 ? Math.max(2, Math.round(1 / probability)) : 10
      substitutions.push(`Repaired no-op rare-event pattern into explicit mini-notation for \`${token}\`.`)
      return `s("${buildRareMiniPattern(token, slots)}")`
    },
  )

  return { code, substitutions }
}

const contractFailure = (message: string): AIResponseContract => ({
  message,
  code: '',
  diff_summary: '',
  has_code_change: false,
})

// Lightweight structural check. Mini-notation and other content inside string
// literals is ignored so `s("bd(3,8)")` and `note("<c e g>")` are not flagged.
const findDelimiterIssue = (code: string): string | null => {
  const stack: string[] = []
  let inString: string | null = null
  let isEscaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index]
    const next = code[index + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }
    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === '\\') {
        isEscaped = true
        continue
      }
      if (char === inString) inString = null
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char
      continue
    }
    if (char === '/' && next === '/') {
      inLineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      index += 1
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      const expected = char === ')' ? '(' : char === ']' ? '[' : '{'
      if (stack.pop() !== expected) {
        return `unbalanced \`${char}\``
      }
    }
  }

  if (inString) return 'an unclosed string literal'
  if (stack.length > 0) return `unclosed \`${stack[stack.length - 1]}\``
  return null
}

export const sanitizeStrudelCode = (input: string): SanitizedCodeResult => {
  let code = normalizeNewlines(stripMarkdownFences(input)).trim()
  const substitutions: string[] = []
  const blockingIssues: string[] = []

  if (!code) {
    return {
      code: '',
      substitutions,
      blockingIssue: 'Generated code was empty.',
    }
  }

  const repaired = repairRareEventPatterns(code)
  code = repaired.code
  substitutions.push(...repaired.substitutions)

  const unsupportedMethods = dedupe(Array.from(code.matchAll(UNSUPPORTED_METHOD_PATTERN), (match) => `.${match[1]}()`))
  if (unsupportedMethods.length > 0) {
    blockingIssues.push(`Unsupported Strudel methods detected: ${unsupportedMethods.join(', ')}.`)
  }

  if (SOMETIMES_BY_SINGLE_ARG_PATTERN.test(code)) {
    blockingIssues.push('`.sometimesBy()` must include both a probability and a transform.')
  }

  const noOpSometimesByCalls = findNoOpSometimesByCalls(code)
  if (noOpSometimesByCalls.length > 0) {
    blockingIssues.push('`.sometimesBy(..., x => x)` is a no-op and must not be used for rare events or muting.')
  }

  if (EMPTY_PATTERN_CALL_PATTERN.test(code)) {
    blockingIssues.push('Empty mini-notation like `s("")` is invalid. Use `~` inside a real pattern or a supported probability transform instead.')
  }

  const delimiterIssue = findDelimiterIssue(code)
  if (delimiterIssue) {
    blockingIssues.push(`Generated code looks syntactically broken (${delimiterIssue}). Return the full, valid Strudel code.`)
  }

  if (/\bawait\s+/.test(code)) {
    code = code.replace(/\bawait\s+/g, '')
    substitutions.push('Removed stray `await` from generated Strudel code.')
  }

  if (/\bgm_electric_piano_1\b/.test(code)) {
    code = code.replace(/\bgm_electric_piano_1\b/g, 'gm_epiano1')
    substitutions.push('Mapped `gm_electric_piano_1` to `gm_epiano1`.')
  }

  for (const soundName of unsupportedSoundNames) {
    const pattern = new RegExp(`\\b${escapeRegExp(soundName)}\\b`, 'g')
    if (!pattern.test(code)) continue
    code = code.replace(pattern, 'hh')
    substitutions.push(`Mapped unsupported percussion \`${soundName}\` to \`hh\`.`)
  }

  // Reject unknown banks up front (case-insensitively), then normalize casing.
  for (const rawBank of dedupe(Array.from(code.matchAll(/\.bank\("([^\"]+)"\)/g), (match) => match[1]))) {
    if (!BANK_NAME_BY_LOWER.has(rawBank.toLowerCase())) {
      blockingIssues.push(`Unsupported drum bank \`${rawBank}\`. Use a bank from the available drum machine list.`)
    }
  }

  code = code.replace(/\.bank\("([^\"]+)"\)/g, (match, bank: string) => {
    const canonical = BANK_NAME_BY_LOWER.get(bank.toLowerCase())
    if (!canonical) return match
    if (canonical !== bank) {
      substitutions.push(`Normalized drum bank \`${bank}\` to \`${canonical}\`.`)
    }
    return `.bank("${canonical}")`
  })

  // Remap invalid voices for the common s("voice(steps)").bank(...) shape.
  code = code.replace(
    /s\("([a-zA-Z0-9]+)\(([^\"]*)\)"\)\.bank\("([^\"]+)"\)/g,
    (match, voice: string, steps: string, bank: string) => {
      const validVoices = VERIFIED_BANK_VOICES[bank]
      if (!validVoices) return match
      const lowerVoice = voice.toLowerCase()
      if (validVoices.includes(lowerVoice)) {
        return lowerVoice === voice ? match : `s("${lowerVoice}(${steps})").bank("${bank}")`
      }
      const fallbackVoice = validVoices.includes('bd') ? 'bd' : validVoices[0]
      substitutions.push(`Mapped invalid voice \`${bank}.${voice}\` to \`${bank}.${fallbackVoice}\`.`)
      return `s("${fallbackVoice}(${steps})").bank("${bank}")`
    },
  )

  return {
    code,
    substitutions: dedupe(substitutions),
    blockingIssue: blockingIssues.length > 0 ? dedupe(blockingIssues).join(' ') : null,
  }
}

export type ChatJsonParseResult =
  | { ok: true; response: AIResponseContract }
  | { ok: false; message: string }

// Escape literal newlines/tabs that appear inside JSON strings, a very common
// LLM failure when embedding multi-line Strudel code.
const escapeControlCharsInStrings = (value: string): string => {
  let out = ''
  let inString = false
  let isEscaped = false
  for (const char of value) {
    if (inString) {
      if (isEscaped) {
        out += char
        isEscaped = false
        continue
      }
      if (char === '\\') {
        out += char
        isEscaped = true
        continue
      }
      if (char === '"') {
        out += char
        inString = false
        continue
      }
      if (char === '\n') {
        out += '\\n'
        continue
      }
      if (char === '\r') {
        out += '\\r'
        continue
      }
      if (char === '\t') {
        out += '\\t'
        continue
      }
      out += char
      continue
    }
    out += char
    if (char === '"') inString = true
  }
  return out
}

// Best-effort repair of common LLM JSON mistakes so a near-miss can still
// become a usable patch instead of a hard failure.
const repairJsonText = (value: string): string => value
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/,\s*(?=[}\]])/g, '')

// Distinguishes a genuine "no change needed" reply (ok:true) from a contract
// violation (ok:false) so callers can retry or surface errors explicitly.
export const parseChatJsonResponseSafe = (content: string, currentCode: string): ChatJsonParseResult => {
  const cleaned = stripMarkdownFences(content).trim()
  // For `{`-leading output, pass the raw text through so parsing fails as
  // "malformed JSON" rather than "not JSON at all".
  const jsonCandidate = extractFirstJsonObject(cleaned) ?? (cleaned.startsWith('{') ? cleaned : null)

  if (!jsonCandidate) {
    return { ok: false, message: 'The model returned text instead of the required JSON object. Ask again with a smaller, more specific request.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonCandidate)
  } catch {
    const repairedCandidate = escapeControlCharsInStrings(repairJsonText(jsonCandidate))
    try {
      parsed = JSON.parse(repairedCandidate)
    } catch {
      return { ok: false, message: 'The model returned malformed JSON. Ask again with a smaller, more specific request.' }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'The model JSON did not match the required response object.' }
  }

  const response = parsed as Record<string, unknown>
  if (
    typeof response.message !== 'string'
    || typeof response.code !== 'string'
    || typeof response.diff_summary !== 'string'
    || typeof response.has_code_change !== 'boolean'
  ) {
    return { ok: false, message: 'The model JSON did not match the required schema with message, code, diff_summary, and has_code_change.' }
  }

  const message = response.message.trim() || 'Updated the project.'
  const diffSummary = response.diff_summary.trim()

  if (!response.has_code_change) {
    return {
      ok: true,
      response: {
        message,
        code: '',
        diff_summary: '',
        has_code_change: false,
      },
    }
  }

  if (!response.code.trim()) {
    return { ok: false, message: 'The model claimed to change code but did not include the full updated Strudel project.' }
  }

  const sanitized = sanitizeStrudelCode(response.code)
  if (sanitized.blockingIssue) {
    return { ok: false, message: `${message} ${sanitized.blockingIssue}`.trim() }
  }

  const nextCode = sanitized.code
  const lineCount = nextCode.split('\n').length
  if (nextCode.length > MAX_CODE_LENGTH || lineCount > MAX_CODE_LINES) {
    return { ok: false, message: 'The proposed code change is too large to review safely. Ask for a smaller, more focused edit.' }
  }

  if (normalizeCodeForComparison(nextCode) === normalizeCodeForComparison(currentCode)) {
    return {
      ok: true,
      response: {
        message,
        code: '',
        diff_summary: '',
        has_code_change: false,
      },
    }
  }

  const substitutionMessage = sanitized.substitutions.join(' ')

  return {
    ok: true,
    response: {
      message: substitutionMessage ? `${message} ${substitutionMessage}`.trim() : message,
      code: nextCode,
      diff_summary: diffSummary || 'Updated the Strudel pattern.',
      has_code_change: true,
    },
  }
}

export const parseChatJsonResponse = (content: string, currentCode: string): AIResponseContract => {
  const result = parseChatJsonResponseSafe(content, currentCode)
  return result.ok ? result.response : contractFailure(result.message)
}

export const extractGeneratedCode = (content: string): string => {
  const cleaned = stripMarkdownFences(content).trim()
  const jsonCandidate = cleaned.startsWith('{') ? extractFirstJsonObject(cleaned) ?? cleaned : null

  if (!jsonCandidate) {
    return cleaned
  }

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>
    if (typeof parsed.code === 'string') {
      return parsed.code.trim()
    }
  } catch {
    return cleaned
  }

  return cleaned
}

export const validateGeneratedCode = (content: string, currentPattern?: string): { code: string } | { error: string } => {
  const candidate = extractGeneratedCode(content)
  const sanitized = sanitizeStrudelCode(candidate)

  if (sanitized.blockingIssue) {
    return { error: sanitized.blockingIssue }
  }

  const code = sanitized.code
  const lineCount = code.split('\n').length
  if (!code) {
    return { error: 'The generator returned an empty pattern.' }
  }

  if (code.length > MAX_CODE_LENGTH || lineCount > MAX_CODE_LINES) {
    return { error: 'The generator returned too much code. Ask for a smaller, more focused pattern.' }
  }

  if (currentPattern && normalizeCodeForComparison(code) === normalizeCodeForComparison(currentPattern)) {
    return { error: 'The generator returned the same pattern unchanged. Ask for a more specific edit or retry.' }
  }

  return { code }
}
