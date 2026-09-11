import { AlertTriangle, RadioTower, Shield, ShieldOff, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ParsedTrack } from '@/lib/codeParser'
import { getDmxPostHeaders } from '@/lib/dmxBridge'
import type { LightingProjectState, SectionMarker } from '@/types/project'
import type { DmxVisualizationData, VisualizationMode } from '@/components/visualization/types'

interface GroupControlState {
  intensity: number
  red: number
  green: number
  blue: number
  white: number
}

const RGBW_CHANNEL_KEYS = ['red', 'green', 'blue', 'white'] as const

interface DmxControlPanelProps {
  data: DmxVisualizationData | null
  bridgeUrl: string | null
  visualizationEnabled: boolean
  visualizationMode: VisualizationMode
  lighting: LightingProjectState
  automationStatus?: Array<{ group_id: string; track_name: string; intensity: number; remaining_ms: number }>
  sectionCandidates: SectionMarker[]
  trackCandidates: ParsedTrack[]
  onVisualizationModeChange: (mode: VisualizationMode) => void
  onLightingChange: (lighting: LightingProjectState) => void
  onRefresh: () => void
}

const DmxControlPanel = ({
  data,
  bridgeUrl,
  visualizationEnabled,
  visualizationMode,
  lighting,
  automationStatus = [],
  sectionCandidates,
  trackCandidates,
  onVisualizationModeChange,
  onLightingChange,
  onRefresh,
}: DmxControlPanelProps) => {
  const pulsePresets = [
    { label: 'Kick', intensity: 255, hold_ms: 180, fade_ms: 40 },
    { label: 'Snare', intensity: 220, hold_ms: 140, fade_ms: 30 },
    { label: 'Hat', intensity: 140, hold_ms: 70, fade_ms: 15 },
    { label: 'Pad', intensity: 160, hold_ms: 600, fade_ms: 120 },
    { label: 'Stab', intensity: 255, hold_ms: 110, fade_ms: 20 },
  ]

  const [groupControls, setGroupControls] = useState<Record<string, GroupControlState>>({})
  const [controlError, setControlError] = useState<string | null>(null)

  useEffect(() => {
    if (!controlError) {
      return
    }

    const timer = window.setTimeout(() => setControlError(null), 4000)
    return () => window.clearTimeout(timer)
  }, [controlError])

  const postControl = async (path: string, payload?: unknown) => {
    if (!bridgeUrl) {
      return
    }

    try {
      const response = await fetch(`${bridgeUrl}${path}`, {
        method: 'POST',
        headers: getDmxPostHeaders(Boolean(payload)),
        body: payload ? JSON.stringify(payload) : undefined,
      })

      if (!response.ok) {
        const message = response.status === 401
          ? 'DMX bridge rejected the request. Set VITE_DMX_HTTP_TOKEN to match DMX_HTTP_TOKEN.'
          : `Control request failed: ${response.status}`
        throw new Error(message)
      }

      setControlError(null)
      onRefresh()
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Unable to send DMX control request.')
    }
  }

  const handleApplyScene = async (sceneId: string) => {
    await postControl('/scenes/apply', { scene_id: sceneId })
  }

  const peak = data ? Math.max(0, ...data.universe.channels) : 0
  const cueBindings = lighting.cue_bindings
  const groupBindings = lighting.group_bindings

  const getGroupControl = (groupId: string): GroupControlState => groupControls[groupId] ?? {
    intensity: 180,
    red: 255,
    green: 255,
    blue: 255,
    white: 0,
  }

  const updateGroupControl = (groupId: string, patch: Partial<GroupControlState>) => {
    setGroupControls((current) => ({
      ...current,
      [groupId]: {
        ...getGroupControl(groupId),
        ...patch,
      },
    }))
  }

  const updateCueBinding = (sectionLabel: string, sceneId: string) => {
    const nextBindings = cueBindings.filter((binding) => binding.section_label !== sectionLabel)
    if (sceneId) {
      nextBindings.push({ section_label: sectionLabel, scene_id: sceneId })
    }
    onLightingChange({ ...lighting, cue_bindings: nextBindings })
  }

  const updateGroupBinding = (trackName: string, groupId: string) => {
    const nextBindings = groupBindings.filter((binding) => binding.track_name !== trackName)
    if (groupId) {
      nextBindings.push({ track_name: trackName, group_id: groupId })
    }
    onLightingChange({ ...lighting, group_bindings: nextBindings })
  }

  const fixtures = data?.patch.fixtures ?? []
  const groups = data?.patch.groups ?? []

  return (
    <div className="space-y-3 rounded-xl border border-cyan-900/60 bg-[linear-gradient(180deg,rgba(8,20,40,0.92),rgba(2,6,23,0.98))] p-3 text-cyan-50 shadow-[inset_0_1px_0_rgba(34,211,238,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/80">DMX Monitor</div>
          <div className="mt-1 text-sm font-semibold text-cyan-50">
            {data ? `${data.backend.toUpperCase()} Universe ${data.universe.universe}` : bridgeUrl ? 'Bridge offline' : 'Bridge not configured'}
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-cyan-800/70 bg-cyan-950/30 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-200/80">
          <RadioTower className="h-3 w-3" />
          {visualizationEnabled ? visualizationMode : 'hidden'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-cyan-900/50 bg-black/20 px-2 py-2">
          <div className="text-cyan-300/70">Bridge</div>
          <div className="mt-1 font-medium text-cyan-50">{bridgeUrl ? (data?.connection.connected ? 'Connected' : 'Waiting') : 'Disabled'}</div>
        </div>
        <div className="rounded-lg border border-cyan-900/50 bg-black/20 px-2 py-2">
          <div className="text-cyan-300/70">Output</div>
          <div className="mt-1 font-medium text-cyan-50">{data?.armed ? 'Armed' : 'Disarmed'}</div>
        </div>
        <div className="rounded-lg border border-cyan-900/50 bg-black/20 px-2 py-2">
          <div className="text-cyan-300/70">Peak</div>
          <div className="mt-1 font-medium text-cyan-50">{peak}</div>
        </div>
      </div>

      {data?.connection ? (
        <div className="rounded-lg border border-cyan-900/50 bg-black/20 px-3 py-2 text-[11px] text-cyan-100/85">
          <div>Backend: {data.connection.backend}</div>
          <div className="truncate">Patch: {data.connection.patch_path}</div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">Automation Status</div>
        {automationStatus.length ? (
          <div className="space-y-2">
            {automationStatus.map((entry) => (
              <div key={`${entry.group_id}:${entry.track_name}`} className="rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/15 px-3 py-2 text-xs text-fuchsia-100/90">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{entry.group_id}</span>
                  <span>{entry.remaining_ms}ms</span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-fuchsia-200/70">
                  {entry.track_name} • intensity {entry.intensity}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-cyan-900/40 bg-black/20 px-3 py-2 text-xs text-cyan-100/70">
            No active DMX automation pulses.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-cyan-700/60 bg-transparent px-2 text-xs text-cyan-100 hover:bg-cyan-900/30"
          onClick={() => void postControl('/control/arm')}
        >
          <Shield className="mr-1 h-3 w-3" /> Arm
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-cyan-700/60 bg-transparent px-2 text-xs text-cyan-100 hover:bg-cyan-900/30"
          onClick={() => void postControl('/control/disarm')}
        >
          <ShieldOff className="mr-1 h-3 w-3" /> Disarm
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-red-700/60 bg-transparent px-2 text-xs text-red-100 hover:bg-red-900/30"
          onClick={() => void postControl('/control/blackout')}
        >
          Blackout
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-cyan-700/60 bg-transparent px-2 text-xs text-cyan-100 hover:bg-cyan-900/30"
          onClick={() => onVisualizationModeChange(visualizationMode === 'hal' ? 'dmx' : 'hal')}
        >
          <Zap className="mr-1 h-3 w-3" /> {visualizationMode === 'hal' ? 'Switch to DMX Viz' : 'Switch to HAL Viz'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-cyan-700/60 bg-transparent px-2 text-xs text-cyan-100 hover:bg-cyan-900/30"
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </div>

      {controlError ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-100/90">
          {controlError}
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">Groups</div>
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.id} className="rounded-lg border border-cyan-900/50 bg-black/20 px-2 py-2 text-xs">
              {(() => {
                const control = getGroupControl(group.id)
                const groupFixtures = fixtures.filter((fixture) => group.fixture_ids.includes(fixture.id))
                const availableChannels = new Set(groupFixtures.flatMap((fixture) => Object.keys(fixture.personality)))
                const showIntensity = availableChannels.has('intensity') || availableChannels.has('dimmer')
                const visibleRgbwChannels = RGBW_CHANNEL_KEYS.filter((channelKey) => availableChannels.has(channelKey))
                const hasRgbwControls = visibleRgbwChannels.length > 0
                return (
                  <>
                    <div className="flex items-center justify-between gap-2 text-cyan-50">
                      <span className="font-medium">{group.label}</span>
                      <span className="text-cyan-300/70">{group.fixture_ids.length} fixtures</span>
                    </div>
                    {showIntensity ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={255}
                          step={1}
                          value={control.intensity}
                          onChange={(event) => updateGroupControl(group.id, { intensity: Number(event.target.value) })}
                          className="flex-1 accent-cyan-400"
                        />
                        <span className="w-8 text-right tabular-nums text-cyan-100">{control.intensity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-cyan-700/60 bg-transparent px-2 text-xs text-cyan-100 hover:bg-cyan-900/30"
                          onClick={() => void postControl('/control/group', { group_id: group.id, intensity: control.intensity })}
                        >
                          Set
                        </Button>
                      </div>
                    ) : null}
                    {hasRgbwControls ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {visibleRgbwChannels.map((key) => {
                          const label = key === 'red' ? 'R' : key === 'green' ? 'G' : key === 'blue' ? 'B' : 'W'
                          const value = control[key]
                          return (
                            <label key={label} className="flex items-center gap-2 rounded-md border border-cyan-900/40 bg-cyan-950/15 px-2 py-1.5 text-[10px] text-cyan-100">
                              <span className="w-3 shrink-0">{label}</span>
                              <input
                                type="range"
                                min={0}
                                max={255}
                                step={1}
                                value={value}
                                onChange={(event) => updateGroupControl(group.id, { [key]: Number(event.target.value) })}
                                className="flex-1 accent-cyan-400"
                              />
                              <span className="w-8 text-right tabular-nums">{value}</span>
                            </label>
                          )
                        })}
                      </div>
                    ) : null}
                    {showIntensity || hasRgbwControls ? (
                      <div className="mt-2 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-fuchsia-700/60 bg-transparent px-2 text-xs text-fuchsia-100 hover:bg-fuchsia-900/30"
                          onClick={() => void postControl('/control/group', {
                            group_id: group.id,
                            ...(showIntensity ? { intensity: control.intensity } : {}),
                            ...(availableChannels.has('red') ? { red: control.red } : {}),
                            ...(availableChannels.has('green') ? { green: control.green } : {}),
                            ...(availableChannels.has('blue') ? { blue: control.blue } : {}),
                            ...(availableChannels.has('white') ? { white: control.white } : {}),
                          })}
                        >
                          {hasRgbwControls ? 'Set Channels' : 'Set'}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )
              })()}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">Section Cue Bindings</div>
        <div className="space-y-2">
          {sectionCandidates.map((section) => {
            const value = cueBindings.find((binding) => binding.section_label === section.label)?.scene_id ?? '__none__'
            return (
              <div key={`${section.label}-${section.line}`} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2 rounded-lg border border-cyan-900/50 bg-black/20 px-2 py-2 text-xs">
                <div className="truncate text-cyan-50">{section.label}</div>
                <Select value={value} onValueChange={(next) => updateCueBinding(section.label, next === '__none__' ? '' : next)}>
                  <SelectTrigger className="h-8 border-cyan-800/70 bg-cyan-950/20 px-2 text-xs text-cyan-50">
                    <SelectValue placeholder="No scene" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No scene</SelectItem>
                    {(data?.scenes ?? []).map((scene) => (
                      <SelectItem key={scene.id} value={scene.id}>{scene.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">Track Group Bindings</div>
        <div className="space-y-2">
          {trackCandidates.map((track) => {
            const binding = groupBindings.find((candidate) => candidate.track_name === track.name)
            const value = binding?.group_id ?? '__none__'
            const intensity = binding?.intensity ?? 180
            const holdMs = binding?.hold_ms ?? 150
            const fadeMs = binding?.fade_ms ?? 30
            const hasBinding = Boolean(binding)
            const updateTrackBinding = (patch: { intensity?: number; hold_ms?: number; fade_ms?: number }) => {
              if (!binding) return
              onLightingChange({
                ...lighting,
                group_bindings: groupBindings.map((candidate) =>
                  candidate.track_name === track.name
                    ? { ...candidate, ...patch }
                    : candidate,
                ),
              })
            }
            return (
              <div key={track.id} className="space-y-2 rounded-lg border border-cyan-900/50 bg-black/20 px-2 py-2 text-xs">
                <div className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2">
                  <div className="truncate text-cyan-50">{track.name}</div>
                  <Select value={value} onValueChange={(next) => updateGroupBinding(track.name, next === '__none__' ? '' : next)}>
                    <SelectTrigger className="h-8 border-cyan-800/70 bg-cyan-950/20 px-2 text-xs text-cyan-50">
                      <SelectValue placeholder="No group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No group</SelectItem>
                      {(data?.patch.groups ?? []).map((group) => (
                        <SelectItem key={group.id} value={group.id}>{group.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-1">
                  {pulsePresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={!hasBinding}
                      onClick={() => updateTrackBinding({ intensity: preset.intensity, hold_ms: preset.hold_ms, fade_ms: preset.fade_ms })}
                      className="rounded-full border border-cyan-800/60 bg-cyan-950/20 px-2 py-1 text-[10px] text-cyan-100 transition hover:bg-cyan-900/35 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-md border border-cyan-900/40 bg-cyan-950/15 px-2 py-1.5 text-[10px] text-cyan-100">
                    <span className="shrink-0">Intensity</span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      step={1}
                      value={intensity}
                      disabled={!hasBinding}
                      onChange={(event) => updateTrackBinding({ intensity: Number(event.target.value) })}
                      className="flex-1 accent-cyan-400"
                    />
                    <span className="w-8 text-right tabular-nums">{intensity}</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-cyan-900/40 bg-cyan-950/15 px-2 py-1.5 text-[10px] text-cyan-100">
                    <span className="shrink-0">Hold</span>
                    <input
                      type="range"
                      min={50}
                      max={2000}
                      step={10}
                      value={holdMs}
                      disabled={!hasBinding}
                      onChange={(event) => updateTrackBinding({ hold_ms: Number(event.target.value) })}
                      className="flex-1 accent-cyan-400"
                    />
                    <span className="w-12 text-right tabular-nums">{holdMs}ms</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-cyan-900/40 bg-cyan-950/15 px-2 py-1.5 text-[10px] text-cyan-100">
                    <span className="shrink-0">Fade</span>
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      step={10}
                      value={fadeMs}
                      disabled={!hasBinding}
                      onChange={(event) => updateTrackBinding({ fade_ms: Number(event.target.value) })}
                      className="flex-1 accent-cyan-400"
                    />
                    <span className="w-12 text-right tabular-nums">{fadeMs}ms</span>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">Scenes</div>
        <div className="grid grid-cols-2 gap-2">
          {(data?.scenes ?? []).map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => void handleApplyScene(scene.id)}
              className="rounded-lg border border-cyan-800/60 bg-cyan-950/25 px-2 py-2 text-left transition hover:bg-cyan-900/35"
            >
              <div className="text-xs font-medium text-cyan-50">{scene.label}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-cyan-300/60">{scene.target_group_id}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">Patch</div>
        <div className="space-y-2">
          {(data?.patch.fixtures ?? []).map((fixture) => (
            <div key={fixture.id} className="rounded-lg border border-cyan-900/50 bg-black/20 px-2 py-2 text-xs">
              <div className="flex items-center justify-between gap-2 text-cyan-50">
                <span className="font-medium">{fixture.label}</span>
                <span className="text-cyan-300/70">{Object.entries(fixture.personality).map(([key, channel]) => `${key}:${channel}`).join(' ')}</span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-cyan-300/60">
                {fixture.group_ids.join(' • ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-100/85">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {bridgeUrl
            ? 'Start `bridges/dmx-mcp` to enable DMX control and monitoring.'
            : 'Set `VITE_DMX_BRIDGE_URL` to enable local DMX control and monitoring.'}
        </div>
      ) : null}
    </div>
  )
}

export default DmxControlPanel
