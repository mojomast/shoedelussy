import type { ExtractedParam, SectionMarker } from '@/types/project'

const sectionPattern = /^\s*\/\/\s*\[([^\]]+)\]/
const scalePattern = /\.scale\((['"`])([^'"`]+)\1\)/g
const cpsPattern = /setcps\((\d*\.?\d+)\)/g
const paramPatterns = [
  { label: 'Gain', kind: 'gain' as const, regex: /\.gain\((\d*\.?\d+)\)/g, min: 0, max: 1.5 },
  { label: 'Speed', kind: 'speed' as const, regex: /\.speed\((\d*\.?\d+)\)/g, min: 0.25, max: 4 },
  { label: 'Room', kind: 'room' as const, regex: /\.room\((\d*\.?\d+)\)/g, min: 0, max: 1 },
  { label: 'CPS', kind: 'cps' as const, regex: /setcps\((\d*\.?\d+)\)/g, min: 0.1, max: 2 },
] as const

const TRACK_START_PATTERN = /^\s*(?:([A-Za-z][\w]*)\s*)?\$:\s*/
const LEGACY_NAMED_TRACK_PATTERN = /^(\s*)([A-Za-z][\w]*)\s+\$:/gm
const DRUM_TOKEN_PATTERN = /\b(?:bd|sd|hh)\b/

export interface ParsedTrack {
  id: string
  index: number
  name: string
  line: number
  start: number
  end: number
  source: string
}

export const normalizeNamedTrackSyntax = (code: string): string => code.replace(LEGACY_NAMED_TRACK_PATTERN, '$1$2$:')

type SupportedEffect = 'room' | 'delay' | 'lpf' | 'hpf' | 'gain'

const formatParamValue = (value: number) => {
  const fixed = value.toFixed(3)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

const formatEffectValue = (value: number) => {
  if (Number.isInteger(value)) {
    return String(value)
  }

  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

const lineOffsets = (code: string) => {
  const offsets = [0]
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === '\n') {
      offsets.push(index + 1)
    }
  }
  return offsets
}

const replaceTrack = (code: string, track: ParsedTrack, nextSource: string) => `${code.slice(0, track.start)}${nextSource}${code.slice(track.end)}`

const appendChainToTrack = (trackSource: string, chain: string) => {
  const trimmedEnd = trackSource.replace(/\s*$/, '')
  const trailingWhitespace = trackSource.slice(trimmedEnd.length)
  return `${trimmedEnd}\n  ${chain}${trailingWhitespace}`
}

const upsertEffectOnTrack = (trackSource: string, effect: SupportedEffect, value: number) => {
  const formattedValue = formatEffectValue(value)
  const effectRegex = new RegExp(`\\.${effect}\\(\\s*[-\\d.]+\\s*\\)`, 'g')
  if (effectRegex.test(trackSource)) {
    effectRegex.lastIndex = 0
    return trackSource.replace(effectRegex, `.${effect}(${formattedValue})`)
  }

  return appendChainToTrack(trackSource, `.${effect}(${formattedValue})`)
}

const stripEffectFromTrack = (trackSource: string, effect: SupportedEffect) => {
  const inlineRegex = new RegExp(`\\n?\\s*\\.${effect}\\(\\s*[-\\d.]+\\s*\\)`, 'g')
  return trackSource.replace(inlineRegex, '')
}

const isMelodicTrack = (trackSource: string) => /\b(?:note|n)\(/.test(trackSource)
const isDrumTrack = (trackSource: string) => /\bs\(/.test(trackSource) && DRUM_TOKEN_PATTERN.test(trackSource)

export const parseBpmFromCode = (code: string): number | undefined => {
  const matches = [...code.matchAll(cpsPattern)]
  const cps = matches.length > 0 ? matches[matches.length - 1][1] : undefined
  if (!cps) return undefined
  const bpm = Number.parseFloat(cps) * 240
  return Number.isFinite(bpm) ? Math.round(bpm) : undefined
}

export const parseKeyFromCode = (code: string): string | undefined => {
  const matches = [...code.matchAll(scalePattern)]
  const value = matches.length > 0 ? matches[matches.length - 1][2] : undefined
  if (!value) return undefined
  return value.replace(':', ' ')
}

export const parseSections = (code: string): SectionMarker[] => {
  return code
    .split('\n')
    .map((line, index) => {
      const match = line.match(sectionPattern)
      if (!match) return null
      return { label: match[1].trim(), line: index + 1 }
    })
    .filter((section): section is SectionMarker => section !== null)
}

export const parseTracks = (code: string): ParsedTrack[] => {
  const lines = code.split('\n')
  const offsets = lineOffsets(code)
  const tracks: ParsedTrack[] = []
  let activeSection = 'track'

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const sectionMatch = line.match(sectionPattern)
    if (sectionMatch) {
      activeSection = sectionMatch[1].trim()
    }

    const trackMatch = line.match(TRACK_START_PATTERN)
    if (!trackMatch) continue

    let endLine = index + 1
    while (endLine < lines.length && !lines[endLine].match(TRACK_START_PATTERN)) {
      endLine += 1
    }

    const start = offsets[index]
    const end = endLine < offsets.length ? offsets[endLine] : code.length
    const explicitName = trackMatch[1]?.trim()
    const name = explicitName || `${activeSection || 'track'}-${tracks.length + 1}`
    tracks.push({
      id: `${name}-${tracks.length}`,
      index: tracks.length,
      name,
      line: index + 1,
      start,
      end,
      source: code.slice(start, end),
    })
  }

  return tracks
}

export const extractParams = (code: string): ExtractedParam[] => {
  const params: ExtractedParam[] = []

  for (const { label, kind, regex, min, max } of paramPatterns) {
    const matches = [...code.matchAll(regex)]
    matches.forEach((match, index) => {
      const value = Number.parseFloat(match[1])
      if (!Number.isFinite(value)) return
      const matchIndex = match.index ?? 0
      const valueIndex = match[0].indexOf(match[1])
      params.push({
        id: `${label.toLowerCase()}-${index}-${matchIndex}`,
        label,
        kind,
        value,
        min,
        max,
        expression: match[0],
        valueStart: matchIndex + valueIndex,
        valueEnd: matchIndex + valueIndex + match[1].length,
      })
    })
  }

  return params
}

export const upsertSetcpsFromBpm = (code: string, bpm: number): string => {
  const cps = Math.max(0.1, Math.round((bpm / 240) * 1000) / 1000)
  const replacement = `setcps(${cps})`
  if (cpsPattern.test(code)) {
    cpsPattern.lastIndex = 0
    return code.replace(cpsPattern, replacement)
  }

  return `${replacement}\n\n${code.trimStart()}`
}

export const updateDetectedParamInCode = (code: string, param: ExtractedParam, nextValue: number): string => {
  const boundedValue = Math.min(param.max, Math.max(param.min, nextValue))
  const formattedValue = formatParamValue(boundedValue)
  return `${code.slice(0, param.valueStart)}${formattedValue}${code.slice(param.valueEnd)}`
}

export const buildMaskString = (cells: boolean[]): string => {
  if (cells.length === 0) return '<>'

  const segments: string[] = []
  let current = cells[0] ? '1' : '0'
  let count = 1

  for (let index = 1; index < cells.length; index += 1) {
    const next = cells[index] ? '1' : '0'
    if (next === current) {
      count += 1
      continue
    }
    segments.push(`${current}!${count}`)
    current = next
    count = 1
  }

  segments.push(`${current}!${count}`)
  return `<${segments.join(' ')}>`
}

export const applyArrangeMasks = (code: string, masks: Record<string, boolean[]>): string => {
  let nextCode = code
  const tracks = parseTracks(code).reverse()

  for (const track of tracks) {
    const cells = masks[track.id]
    if (!cells) continue
    const maskValue = buildMaskString(cells)
    const withoutMask = track.source.replace(/\n?\s*\.mask\((['"`]).*?\1\)/gs, '')
    const updatedTrack = appendChainToTrack(withoutMask, `.mask("${maskValue}")`)
    nextCode = replaceTrack(nextCode, track, updatedTrack)
  }

  return nextCode
}

export const applyEffectToAllTracks = (code: string, effect: SupportedEffect, value: number): string => {
  let nextCode = code
  const tracks = parseTracks(code).reverse()

  for (const track of tracks) {
    const updatedTrack = value <= 0 && effect !== 'gain'
      ? stripEffectFromTrack(track.source, effect)
      : upsertEffectOnTrack(track.source, effect, value)
    nextCode = replaceTrack(nextCode, track, updatedTrack)
  }

  return nextCode
}

export const mutateDrumTracks = (code: string): string => {
  const tracks = parseTracks(code)
  const drumTracks = tracks.filter((track) => isDrumTrack(track.source))
  if (drumTracks.length === 0) return code

  let nextCode = code
  const configs = [
    { token: 'bd', beats: 3 + Math.floor(Math.random() * 3), steps: 16, offset: Math.floor(Math.random() * 4) },
    { token: 'sd', beats: 1 + Math.floor(Math.random() * 3), steps: 16, offset: Math.floor(Math.random() * 4) },
    { token: 'hh', beats: 4 + Math.floor(Math.random() * 4), steps: 8, offset: Math.floor(Math.random() * 4) },
  ] as const

  for (const track of drumTracks.reverse()) {
    let updated = track.source
    for (const config of configs) {
      const euclid = `${config.token}(${config.beats},${config.steps}${config.offset > 0 ? `,${config.offset}` : ''})`
      const tokenPattern = new RegExp(`\\b${config.token}(?:\\([^)]*\\))?\\b`, 'g')
      updated = updated.replace(tokenPattern, euclid)
    }
    nextCode = replaceTrack(nextCode, track, updated)
  }

  return nextCode
}

export const addVariationToRandomTrack = (code: string): string => {
  const tracks = parseTracks(code).filter((track) => !track.source.includes('.sometimes('))
  if (tracks.length === 0) return code
  const target = tracks[Math.floor(Math.random() * tracks.length)]
  const updatedTrack = appendChainToTrack(target.source, '.sometimes(x => x.rev())')
  return replaceTrack(code, target, updatedTrack)
}

export const addRandomReverbToTracks = (code: string): string => {
  let nextCode = code
  const tracks = parseTracks(code).reverse()

  for (const track of tracks) {
    if (track.source.includes('.room(')) continue
    const value = (Math.random() * 0.6 + 0.1).toFixed(2)
    nextCode = replaceTrack(nextCode, track, appendChainToTrack(track.source, `.room(${value})`))
  }

  return nextCode
}

export const addJuxRevToRandomMelodicTrack = (code: string): string => {
  const tracks = parseTracks(code).filter((track) => isMelodicTrack(track.source) && !track.source.includes('.jux('))
  if (tracks.length === 0) return code
  const target = tracks[Math.floor(Math.random() * tracks.length)]
  const updatedTrack = appendChainToTrack(target.source, '.jux(rev)')
  return replaceTrack(code, target, updatedTrack)
}

export interface TrackGain {
  trackId: string
  trackName: string
  trackIndex: number
  gain: number
  gainStart: number
  gainEnd: number
  hasGain: boolean
  pan: number
  panStart: number
  panEnd: number
  hasPan: boolean
}

export const parseTrackGains = (code: string): TrackGain[] => {
  const tracks = parseTracks(code)
  return tracks.map((track) => {
    const gainMatch = track.source.match(/\.gain\(\s*([\d.]+)\s*\)/)
    const panMatch = track.source.match(/\.pan\(\s*(-?[\d.]+)\s*\)/)
    const gain = gainMatch ? parseFloat(gainMatch[1]) : 0.8
    const pan = panMatch ? parseFloat(panMatch[1]) : 0
    const globalOffset = track.start
    let gainStart = -1
    let gainEnd = -1
    let panStart = -1
    let panEnd = -1
    if (gainMatch && gainMatch.index !== undefined) {
      const innerStart = gainMatch.index + gainMatch[0].indexOf(gainMatch[1])
      gainStart = globalOffset + innerStart
      gainEnd = gainStart + gainMatch[1].length
    }
    if (panMatch && panMatch.index !== undefined) {
      const innerStart = panMatch.index + panMatch[0].indexOf(panMatch[1])
      panStart = globalOffset + innerStart
      panEnd = panStart + panMatch[1].length
    }
    return {
      trackId: track.id,
      trackName: track.name,
      trackIndex: track.index,
      gain,
      gainStart,
      gainEnd,
      hasGain: gainMatch !== null,
      pan,
      panStart,
      panEnd,
      hasPan: panMatch !== null,
    }
  })
}
