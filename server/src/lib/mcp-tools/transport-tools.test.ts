import { describe, expect, it } from 'vitest'
import { countSections, parseBpmFromCode, upsertSetcps } from './transport-tools'

describe('transport MCP helpers', () => {
  it('set_bpm prepends setcps correctly', () => {
    expect(upsertSetcps('$: s("bd sd")', 120)).toContain('setcps(0.5)')
  })

  it('set_bpm replaces legacy setcpm values with setcps', () => {
    expect(upsertSetcps('setcpm(60)\n$: s("bd sd")', 120)).toContain('setcps(0.5)')
  })

  it('get_state BPM parser reads setcps values', () => {
    expect(parseBpmFromCode('setcps(0.5)\n$: s("bd sd")')).toBe(120)
  })

  it('get_state BPM parser reads setcpm values', () => {
    expect(parseBpmFromCode('setcpm(72)\n$: s("bd sd")')).toBe(144)
  })

  it('get_state counts section markers', () => {
    const code = '// [intro]\n$: s("bd")\n\n// [drop]\n$: s("sd")'
    expect(countSections(code)).toBe(2)
  })
})
