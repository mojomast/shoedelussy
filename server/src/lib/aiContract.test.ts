import { describe, expect, it } from 'vitest'
import {
  extractFirstJsonObject,
  parseChatJsonResponse,
  parseChatJsonResponseSafe,
  sanitizeStrudelCode,
  validateGeneratedCode,
} from './aiContract'

describe('extractFirstJsonObject', () => {
  it('finds the first balanced object even with surrounding prose', () => {
    const input = 'hello {"message":"ok","code":"setcps(0.5)","diff_summary":"x","has_code_change":true} trailing'
    expect(extractFirstJsonObject(input)).toBe('{"message":"ok","code":"setcps(0.5)","diff_summary":"x","has_code_change":true}')
  })
})

describe('parseChatJsonResponse', () => {
  it('rejects malformed json content', () => {
    const result = parseChatJsonResponse('{"message":', 'setcps(0.5)')
    expect(result.has_code_change).toBe(false)
    expect(result.message).toMatch(/malformed json/i)
  })

  it('rejects schema mismatches', () => {
    const result = parseChatJsonResponse('{"message":"ok","has_code_change":false}', 'setcps(0.5)')
    expect(result.has_code_change).toBe(false)
    expect(result.message).toMatch(/required schema/i)
  })

  it('maps unsupported percussion and invalid bank voices safely', () => {
    const result = parseChatJsonResponse(
      JSON.stringify({
        message: 'Updated drums.',
        code: 'setcps(0.5)\n$: s("cowbell(3,8)").bank("RolandTR808")',
        diff_summary: 'Adjusted drums',
        has_code_change: true,
      }),
      'setcps(0.5)\n$: s("bd(3,8)").bank("RolandTR808")',
    )

    expect(result.has_code_change).toBe(true)
    expect(result.code).toContain('hh(3,8)')
    expect(result.code).toContain('.bank("RolandTR808")')
    expect(result.message).toMatch(/mapped unsupported percussion/i)
  })

  it('rejects unsupported methods instead of passing them through', () => {
    const result = parseChatJsonResponse(
      JSON.stringify({
        message: 'Added movement.',
        code: 'setcps(0.5)\n$: s("bd sd").trancegate(8)',
        diff_summary: 'Added movement',
        has_code_change: true,
      }),
      'setcps(0.5)\n$: s("bd sd")',
    )

    expect(result.has_code_change).toBe(false)
    expect(result.message).toMatch(/unsupported strudel methods/i)
  })

  it('rejects unchanged code when has_code_change is true', () => {
    const currentCode = 'setcps(0.5)\n$: s("bd sd")'
    const result = parseChatJsonResponse(
      JSON.stringify({
        message: 'No changes needed.',
        code: currentCode,
        diff_summary: 'Kept same',
        has_code_change: true,
      }),
      currentCode,
    )

    expect(result.has_code_change).toBe(false)
    expect(result.code).toBe('')
  })

  it('repairs invalid rare-event speech patterns into explicit mini notation', () => {
    const result = parseChatJsonResponse(
      JSON.stringify({
        message: 'Made the speech rare.',
        code: 'samples("shabda/speech:blong_is_a_kitty_cat")\nsetcps(0.5)\n$: s("").sometimesBy(0.1, x => s("blong_is_a_kitty_cat"))',
        diff_summary: 'Adjusted speech rarity',
        has_code_change: true,
      }),
      'samples("shabda/speech:blong_is_a_kitty_cat")\nsetcps(0.5)',
    )

    expect(result.has_code_change).toBe(true)
    expect(result.code).toContain('s("blong_is_a_kitty_cat ~ ~ ~ ~ ~ ~ ~ ~ ~")')
    expect(result.message).toMatch(/repaired invalid rare-event pattern/i)
  })
})

describe('parseChatJsonResponseSafe', () => {
  it('reports malformed output as a failure', () => {
    const result = parseChatJsonResponseSafe('not json at all', 'setcps(0.5)')
    expect(result.ok).toBe(false)
  })

  it('reports a valid no-change response as success', () => {
    const result = parseChatJsonResponseSafe(
      JSON.stringify({ message: 'No change.', code: '', diff_summary: '', has_code_change: false }),
      'setcps(0.5)',
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.response.has_code_change).toBe(false)
  })
})

describe('sanitizeStrudelCode', () => {
  it('blocks one-argument sometimesBy usage', () => {
    const sanitized = sanitizeStrudelCode('setcps(0.5)\n$: s("bd sd").sometimesBy(0.3)')
    expect(sanitized.blockingIssue).toMatch(/sometimesBy/i)
  })

  it('flags one-argument sometimesBy consistently across repeated calls', () => {
    const code = 'setcps(0.5)\n$: s("bd sd").sometimesBy(0.3)'
    expect(sanitizeStrudelCode(code).blockingIssue).toMatch(/sometimesBy/i)
    expect(sanitizeStrudelCode(code).blockingIssue).toMatch(/sometimesBy/i)
  })

  it('flags empty mini-notation consistently across repeated calls', () => {
    const code = 'setcps(0.5)\n$: s("")'
    expect(sanitizeStrudelCode(code).blockingIssue).toMatch(/empty mini-notation/i)
    expect(sanitizeStrudelCode(code).blockingIssue).toMatch(/empty mini-notation/i)
  })

  it('accepts the expanded drum machine bank list', () => {
    const sanitized = sanitizeStrudelCode('setcps(0.5)\n$: s("bd sd hh").bank("OberheimDMX")')
    expect(sanitized.blockingIssue).toBeNull()
    expect(sanitized.code).toContain('.bank("OberheimDMX")')
  })

  it('normalizes lowercase bank names to canonical casing', () => {
    const sanitized = sanitizeStrudelCode('setcps(0.5)\n$: s("bd sd").bank("rolandtr909")')
    expect(sanitized.blockingIssue).toBeNull()
    expect(sanitized.code).toContain('.bank("RolandTR909")')
    expect(sanitized.substitutions.join(' ')).toMatch(/normalized/i)
  })

  it('rejects unknown drum banks', () => {
    const sanitized = sanitizeStrudelCode('setcps(0.5)\n$: s("bd sd").bank("NotARealBank")')
    expect(sanitized.blockingIssue).toMatch(/unsupported drum bank/i)
  })

  it('flags unbalanced delimiters', () => {
    const sanitized = sanitizeStrudelCode('setcps(0.5)\n$: s("bd sd"')
    expect(sanitized.blockingIssue).toMatch(/syntactically broken/i)
  })

  it('does not flag balanced mini-notation brackets inside strings', () => {
    const sanitized = sanitizeStrudelCode('setcps(0.5)\n$: s("bd(3,8) [sd [~ hh]]")')
    expect(sanitized.blockingIssue).toBeNull()
  })

  it('recovers JSON with a literal newline inside a string value', () => {
    const content = '{"message":"Added drums.","code":"setcps(0.5)\n$: s(\\"bd sd\\")","diff_summary":"x","has_code_change":true}'
    const result = parseChatJsonResponseSafe(content, 'setcps(0.5)')
    expect(result.ok).toBe(true)
  })

  it('recovers JSON with a trailing comma', () => {
    const content = '{"message":"ok","code":"","diff_summary":"","has_code_change":false,}'
    const result = parseChatJsonResponseSafe(content, 'setcps(0.5)')
    expect(result.ok).toBe(true)
  })

  it('blocks no-op sometimesBy transforms', () => {
    const sanitized = sanitizeStrudelCode('setcps(0.5)\n$: s("blong_is_a_kitty_cat").sometimesBy(0.1, x => x)')
    expect(sanitized.blockingIssue).toBeNull()
    expect(sanitized.code).toContain('s("blong_is_a_kitty_cat ~ ~ ~ ~ ~ ~ ~ ~ ~")')
  })

  it('blocks empty mini notation patterns', () => {
    const sanitized = sanitizeStrudelCode('setcps(0.5)\n$: s("").sometimesBy(0.1, x => s("blong_is_a_kitty_cat"))')
    expect(sanitized.blockingIssue).toBeNull()
    expect(sanitized.code).toContain('s("blong_is_a_kitty_cat ~ ~ ~ ~ ~ ~ ~ ~ ~")')
  })
})

describe('validateGeneratedCode', () => {
  it('extracts code from accidental json envelopes', () => {
    const result = validateGeneratedCode('{"code":"setcps(0.5)\\n$: s(\\"bd sd\\")"}')
    expect('code' in result && result.code.includes('setcps')).toBe(true)
  })

  it('rejects unchanged generated patterns during fix flows', () => {
    const currentPattern = 'setcps(0.5)\n$: s("bd sd")'
    const result = validateGeneratedCode(currentPattern, currentPattern)
    expect('error' in result && /same pattern unchanged/i.test(result.error)).toBe(true)
  })
})
