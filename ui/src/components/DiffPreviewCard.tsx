import { memo, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Square } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { diffLines } from '@/lib/diffUtils'
import { cn } from '@/lib/utils'
import type { CodeDiff } from '@/types/project'

interface DiffPreviewCardProps {
  messageId: string
  diff: CodeDiff
  status?: 'pending' | 'applied' | 'rejected' | 'error'
  isPreviewing?: boolean
  onApply?: (messageId: string, diff: CodeDiff) => void
  onReject?: (messageId: string, diff: CodeDiff) => void
  onPreview?: (messageId: string, diff: CodeDiff) => void
  onStopPreview?: (messageId: string, diff: CodeDiff) => void
}

const statusLabel: Record<NonNullable<DiffPreviewCardProps['status']>, string> = {
  pending: 'Awaiting review',
  applied: 'Applied',
  rejected: 'Rejected',
  error: 'Error',
}

const DIFF_PREVIEW_LINE_LIMIT = 20

const syntaxStyle = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: 'transparent',
    margin: 0,
    padding: 0,
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent',
  },
}

const DiffPreviewCard = ({ messageId, diff, status = 'pending', isPreviewing = false, onApply, onReject, onPreview, onStopPreview }: DiffPreviewCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const lines = useMemo(() => diffLines(diff.before, diff.after), [diff.before, diff.after])
  // When collapsed, center the window on the first real change instead of the
  // top of the file, which often hides the actual patch.
  const { visibleLines, windowStart } = useMemo(() => {
    if (isExpanded || lines.length <= DIFF_PREVIEW_LINE_LIMIT) {
      return { visibleLines: lines, windowStart: 0 }
    }
    const firstChange = lines.findIndex((line) => line.type !== 'context')
    const start = firstChange === -1 ? 0 : Math.max(0, firstChange - Math.floor(DIFF_PREVIEW_LINE_LIMIT / 3))
    return { visibleLines: lines.slice(start, start + DIFF_PREVIEW_LINE_LIMIT), windowStart: start }
  }, [isExpanded, lines])

  return (
    <Card className="border-purple-500/20 bg-black/40 shadow-none">
      <CardHeader className="space-y-3 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">AI Patch Preview</p>
            <p className="text-xs text-zinc-400">{diff.summary}</p>
          </div>
          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-300">
            {statusLabel[status]}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 transition hover:border-zinc-700 hover:text-white"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
          {!isExpanded && lines.length > DIFF_PREVIEW_LINE_LIMIT ? (
            <span>Showing lines {windowStart + 1}–{windowStart + visibleLines.length} of {lines.length}</span>
          ) : null}
        </div>

        <div className="max-h-56 overflow-auto rounded-md border border-zinc-900 bg-zinc-950/90 p-3 font-mono text-xs">
          {windowStart > 0 ? <div className="px-1 text-zinc-600">…</div> : null}
          {visibleLines.map((line, index) => (
            <div
              key={`${line.type}-${index}`}
              className={cn('flex items-start gap-2',
                line.type === 'added'
                  ? 'text-emerald-300'
                  : line.type === 'removed'
                    ? 'text-rose-300'
                    : 'text-zinc-500')}
            >
              <span className="inline-block w-4 shrink-0 text-zinc-600">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <div className="min-w-0 flex-1">
                <SyntaxHighlighter
                  language="javascript"
                  style={syntaxStyle}
                  customStyle={{ background: 'transparent', padding: 0, margin: 0 }}
                  codeTagProps={{ style: { background: 'transparent' } }}
                  wrapLongLines
                >
                  {line.text || ' '}
                </SyntaxHighlighter>
              </div>
            </div>
          ))}
        </div>

        {status === 'pending' ? (
          <div className="flex gap-2">
            {isPreviewing ? (
              <Button variant="outline" className="border-cyan-700 bg-transparent text-cyan-200 hover:bg-cyan-950/40" onClick={() => onStopPreview?.(messageId, diff)}>
                <Square className="mr-2 h-4 w-4" />
                Stop Preview
              </Button>
            ) : (
              <Button variant="outline" className="border-cyan-700 bg-transparent text-cyan-200 hover:bg-cyan-950/40" onClick={() => onPreview?.(messageId, diff)}>
                Preview
              </Button>
            )}
            <Button className="bg-purple-600 text-white hover:bg-purple-500" onClick={() => onApply?.(messageId, diff)}>
              Apply
            </Button>
            <Button variant="outline" className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900" onClick={() => onReject?.(messageId, diff)}>
              Reject
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default memo(DiffPreviewCard)
