import { memo, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { applyArrangeMasks, buildMaskString, parseTracks, type ParsedTrack } from '@/lib/codeParser'

interface ArrangePanelProps {
  code: string
  collapsed: boolean
  onToggle: () => void
  onApplyCode: (code: string) => void
}

const DEFAULT_CELLS = Array.from({ length: 16 }, () => true)

const buildInitialMasks = (tracks: ParsedTrack[]) =>
  Object.fromEntries(tracks.map((track) => [track.id, [...DEFAULT_CELLS]])) as Record<string, boolean[]>

const ArrangePanel = ({ code, collapsed, onToggle, onApplyCode }: ArrangePanelProps) => {
  const tracks = useMemo(() => parseTracks(code), [code])
  const [masks, setMasks] = useState<Record<string, boolean[]>>(() => buildInitialMasks(tracks))
  const [previewCode, setPreviewCode] = useState(code)

  useEffect(() => {
    // Preserve any mask toggles the user already made; only add defaults for
    // newly detected tracks. This effect fires on every editor keystroke.
    setMasks((current) => {
      const next: Record<string, boolean[]> = {}
      for (const track of tracks) {
        next[track.id] = current[track.id] ?? [...DEFAULT_CELLS]
      }
      return next
    })
    setPreviewCode(code)
  }, [code, tracks])

  const content = (
    <div className="space-y-4">
      {tracks.length === 0 ? <p className="text-sm text-zinc-500">No $: tracks found in the current code.</p> : null}

      {tracks.map((track) => (
        <div key={track.id} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-100">{track.name}</span>
            <span className="font-mono text-xs text-zinc-500">{buildMaskString(masks[track.id] ?? DEFAULT_CELLS)}</span>
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
            {(masks[track.id] ?? DEFAULT_CELLS).map((cell, index) => (
              <button
                key={`${track.id}-${index}`}
                type="button"
                onClick={() => setMasks((current) => ({
                  ...current,
                  [track.id]: (current[track.id] ?? DEFAULT_CELLS).map((value, valueIndex) => valueIndex === index ? !value : value),
                }))}
                className={`h-7 rounded-md border text-[10px] transition ${cell ? 'border-purple-500 bg-purple-500/25 text-white' : 'border-zinc-800 bg-black/60 text-zinc-500'}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900"
          onClick={() => setPreviewCode(applyArrangeMasks(code, masks))}
        >
          Generate mask()
        </Button>
        <Button className="bg-purple-600 text-white hover:bg-purple-500" onClick={() => onApplyCode(previewCode)}>
          Apply to Editor
        </Button>
      </div>

      <textarea
        value={previewCode}
        onChange={(event) => setPreviewCode(event.target.value)}
        className="min-h-[180px] w-full rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-xs text-zinc-200 outline-none focus:border-purple-500"
      />
    </div>
  )

  if (!collapsed) {
    return content
  }

  return (
    <Card className="border-zinc-900 bg-black/40 shadow-none">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <button type="button" onClick={onToggle} className="flex w-full items-center justify-between text-left">
          <div>
            <p className="text-sm font-semibold text-white">Arrange</p>
            <p className="text-xs text-zinc-500">Toggle per-cycle masks for each detected $: track.</p>
          </div>
          {collapsed ? <ChevronRight className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </button>

        {!collapsed ? content : null}
      </CardContent>
    </Card>
  )
}

export default memo(ArrangePanel)
