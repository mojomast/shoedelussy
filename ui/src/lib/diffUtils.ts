import type { CodeDiff } from '@/types/project'

export interface DiffLine {
  type: 'added' | 'removed' | 'context'
  text: string
}

export const buildCodeDiff = (before: string, after: string, summary: string): CodeDiff => ({
  before,
  after,
  summary,
})

// Above this many line pairs the O(n*m) LCS table gets expensive, so fall back
// to a prefix/suffix trim that still produces a correct, if coarser, diff.
const MAX_LCS_CELLS = 2_000_000

const diffLinesLcs = (beforeLines: string[], afterLines: string[]): DiffLine[] => {
  const n = beforeLines.length
  const m = afterLines.length

  // dp[i][j] = LCS length of beforeLines[i..] and afterLines[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = beforeLines[i] === afterLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ type: 'context', text: beforeLines[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'removed', text: beforeLines[i] })
      i += 1
    } else {
      lines.push({ type: 'added', text: afterLines[j] })
      j += 1
    }
  }
  while (i < n) {
    lines.push({ type: 'removed', text: beforeLines[i] })
    i += 1
  }
  while (j < m) {
    lines.push({ type: 'added', text: afterLines[j] })
    j += 1
  }

  return lines
}

const diffLinesTrimmed = (beforeLines: string[], afterLines: string[]): DiffLine[] => {
  let start = 0
  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) {
    start += 1
  }
  let endBefore = beforeLines.length - 1
  let endAfter = afterLines.length - 1
  while (endBefore >= start && endAfter >= start && beforeLines[endBefore] === afterLines[endAfter]) {
    endBefore -= 1
    endAfter -= 1
  }

  return [
    ...beforeLines.slice(0, start).map((text): DiffLine => ({ type: 'context', text })),
    ...beforeLines.slice(start, endBefore + 1).map((text): DiffLine => ({ type: 'removed', text })),
    ...afterLines.slice(start, endAfter + 1).map((text): DiffLine => ({ type: 'added', text })),
    ...beforeLines.slice(endBefore + 1).map((text): DiffLine => ({ type: 'context', text })),
  ]
}

export const diffLines = (before: string, after: string): DiffLine[] => {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')

  if (beforeLines.length * afterLines.length > MAX_LCS_CELLS) {
    return diffLinesTrimmed(beforeLines, afterLines)
  }

  return diffLinesLcs(beforeLines, afterLines)
}
