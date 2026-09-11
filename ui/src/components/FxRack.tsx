import { memo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { applyEffectToAllTracks } from '@/lib/codeParser'

interface FxRackProps {
  code: string
  collapsed: boolean
  onToggle: () => void
  onApplyCode: (code: string) => void
}

interface FxControl {
  label: string
  effect: 'room' | 'delay' | 'lpf' | 'hpf' | 'gain'
  min: number
  max: number
  step: number
  defaultValue: number
}

const controls: FxControl[] = [
  { label: 'Room / Reverb', effect: 'room', min: 0, max: 1, step: 0.01, defaultValue: 0.2 },
  { label: 'Delay', effect: 'delay', min: 0, max: 1, step: 0.01, defaultValue: 0 },
  { label: 'LP Filter', effect: 'lpf', min: 200, max: 20000, step: 50, defaultValue: 8000 },
  { label: 'HP Filter', effect: 'hpf', min: 0, max: 2000, step: 25, defaultValue: 0 },
  { label: 'Global Gain', effect: 'gain', min: 0, max: 1.5, step: 0.01, defaultValue: 1 },
]

const FxRack = ({ code, collapsed, onToggle, onApplyCode }: FxRackProps) => {
  const [values, setValues] = useState<Record<FxControl['effect'], number>>({
    room: 0.2,
    delay: 0,
    lpf: 8000,
    hpf: 0,
    gain: 1,
  })
  const [enabled, setEnabled] = useState<Partial<Record<FxControl['effect'], boolean>>>({
    room: true,
    delay: false,
    lpf: false,
    hpf: false,
    gain: true,
  })

  const content = (
    <div className="space-y-3">
      {controls.map((control) => (
        <div key={control.effect} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-3 flex items-center justify-between text-sm text-zinc-100">
            <span>{control.label}</span>
            <span className="text-zinc-400">{enabled[control.effect] ? values[control.effect] : 'Off'}</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              aria-pressed={!!enabled[control.effect]}
              aria-label={`${enabled[control.effect] ? 'Disable' : 'Enable'} ${control.label}`}
              onClick={() => setEnabled((current) => ({ ...current, [control.effect]: !current[control.effect] }))}
              className={enabled[control.effect]
                ? 'rounded-full px-2 py-0.5 text-xs bg-purple-600 text-white'
                : 'rounded-full px-2 py-0.5 text-xs border border-zinc-700 text-zinc-500'}
            >
              {enabled[control.effect] ? 'On' : 'Off'}
            </button>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={values[control.effect]}
              onChange={(event) => setValues((current) => ({ ...current, [control.effect]: Number(event.target.value) }))}
              disabled={!enabled[control.effect]}
              className="w-full accent-purple-500"
            />
            <Button
              variant="outline"
              className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900"
              disabled={!enabled[control.effect]}
              onClick={() => {
                if (!enabled[control.effect]) return
                onApplyCode(applyEffectToAllTracks(code, control.effect, values[control.effect]))
              }}
            >
              Apply to All Tracks
            </Button>
          </div>
        </div>
      ))}
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
            <p className="text-sm font-semibold text-white">FX Rack</p>
            <p className="text-xs text-zinc-500">Push room, delay, filters, or gain across every $: track.</p>
          </div>
          {collapsed ? <ChevronRight className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </button>

        {!collapsed ? content : null}
      </CardContent>
    </Card>
  )
}

export default memo(FxRack)
