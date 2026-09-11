import { useState } from 'react'
import { getDmxPostHeaders } from '@/lib/dmxBridge'
import type { DmxVisualizationData } from './types'

interface DmxVisualizationProps {
  data?: DmxVisualizationData | null
  bridgeUrl?: string | null
}

const DmxVisualization = ({ data, bridgeUrl }: DmxVisualizationProps) => {
  const [isApplying, setIsApplying] = useState(false)
  const channels = data?.universe?.channels ?? Array.from({ length: 32 }, () => 0)
  const previewChannels = channels.slice(0, 32)

  const handleApplyScene = async (sceneId: string) => {
    if (!bridgeUrl) {
      return
    }

    setIsApplying(true)
    try {
      await fetch(`${bridgeUrl}/scenes/apply`, {
        method: 'POST',
        headers: getDmxPostHeaders(),
        body: JSON.stringify({ scene_id: sceneId }),
      })
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[radial-gradient(circle_at_top,#0f172a,transparent_55%),linear-gradient(180deg,#020617,#000)] p-3 text-white">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-cyan-200/80">
        <span>{data ? `DMX ${data.backend}` : 'DMX preview'}</span>
        <span>{data ? `${data.universe.source} u${data.universe.universe}` : 'no feed'}</span>
      </div>
      {!data ? (
        <div className="mb-3 rounded-lg border border-cyan-900/70 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100/80">
          {bridgeUrl
            ? `Waiting for local bridge state on \`${bridgeUrl}/state\`.`
            : 'DMX bridge not configured. Set `VITE_DMX_BRIDGE_URL` to enable bridge polling.'}
        </div>
      ) : null}
      {data?.scenes?.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {data.scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              disabled={isApplying}
              onClick={() => void handleApplyScene(scene.id)}
              className="rounded-md border border-cyan-700/60 bg-cyan-950/25 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scene.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid flex-1 grid-cols-8 gap-2">
        {previewChannels.map((value, index) => (
          <div key={index} className="flex min-h-0 flex-col justify-end gap-1 rounded-lg border border-cyan-950/80 bg-black/30 p-2">
            <div
              className="w-full rounded-sm bg-cyan-400/80 transition-[height] duration-150"
              style={{ height: `${Math.max(4, Math.round((value / 255) * 100))}%` }}
            />
            <div className="text-[10px] text-cyan-100/70">{index + 1}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-cyan-100/75">
        <span>{data ? `rev ${data.universe.revision}` : 'waiting for bridge state'}</span>
        <span>{data?.armed ? 'armed' : 'disarmed'}</span>
      </div>
    </div>
  )
}

export default DmxVisualization
