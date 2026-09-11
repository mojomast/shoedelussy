import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDmxPostHeaders } from '@/lib/dmxBridge'
import type { LightingProjectState, LightingTrackBinding } from '@/types/project'
import type { CycleInfo } from '@/components/StrudelEditor'

export interface TrackActivity {
  activeTracks: string[]
  cycleStart: number
  cycleEnd: number
}

interface AutomationStatusEntry {
  group_id: string
  track_name: string
  intensity: number
  remaining_ms: number
}

interface UseDmxAutomationArgs {
  isPlaying: boolean
  dmxBridgeUrl: string | null
  lighting: LightingProjectState
  trackActivity: TrackActivity
  cycleInfo: CycleInfo | null
}

const postGroupIntensity = async (
  dmxBridgeUrl: string,
  groupId: string,
  intensity: number,
  colorPayload: Record<string, number> = {},
) => {
  await fetch(`${dmxBridgeUrl}/control/group`, {
    method: 'POST',
    headers: getDmxPostHeaders(),
    body: JSON.stringify({ group_id: groupId, intensity, ...colorPayload }),
  })
}

const colorForBinding = (binding: LightingTrackBinding): Record<string, number> => {
  if (binding.track_name === 'kick' || binding.group_id === 'strobes') {
    return { white: 255 }
  }
  if (binding.track_name === 'snare' || binding.group_id === 'front_wash') {
    return { red: 255, green: 95, blue: 45, white: 80 }
  }
  if (binding.track_name === 'floor' || binding.group_id === 'floor') {
    return { red: 25, green: 235, blue: 180 }
  }
  if (binding.track_name === 'lead' || binding.group_id === 'all_wash') {
    return { red: 145, green: 65, blue: 255, white: 25 }
  }
  if (binding.track_name === 'beam' || binding.group_id === 'back_beams') {
    return { red: 45, green: 115, blue: 255 }
  }
  return { red: 90, green: 220, blue: 255, white: 30 }
}

const demoTracksForStep = (step: number) => {
  const tracks = ['floor']
  if (step % 2 === 0) tracks.push('kick')
  if (step === 2 || step === 6) tracks.push('snare')
  if (step % 2 === 1) tracks.push('lead')
  if (step === 0 || step === 4) tracks.push('beam')
  return tracks
}

export const useDmxAutomation = ({
  isPlaying,
  dmxBridgeUrl,
  lighting,
  trackActivity,
  cycleInfo,
}: UseDmxAutomationArgs) => {
  const [activeLightingGroup, setActiveLightingGroup] = useState<string | null>(null)
  const [automationStatus, setAutomationStatus] = useState<AutomationStatusEntry[]>([])
  const groupPulseTimersRef = useRef<Map<string, number>>(new Map())
  const stepTimerIdsRef = useRef<number[]>([])
  const demoFallbackTimersRef = useRef<number[]>([])
  const lastGroupPulseKeysRef = useRef<Set<string>>(new Set())
  const groupPulseMetaRef = useRef<Map<string, { track_name: string; intensity: number; ends_at: number }>>(new Map())
  const lastTriggeredGroupRef = useRef<string | null>(null)
  const lastRealTriggerAtRef = useRef(0)
  const fallbackStepRef = useRef(0)
  const latestActiveTracksRef = useRef<string[]>([])
  const activeTrackKey = trackActivity.activeTracks.join('|')

  const stableTrackActivity = useMemo<TrackActivity>(() => ({
    activeTracks: [...trackActivity.activeTracks],
    cycleStart: trackActivity.cycleStart,
    cycleEnd: trackActivity.cycleEnd,
  }), [activeTrackKey, trackActivity.cycleEnd, trackActivity.cycleStart])

  latestActiveTracksRef.current = stableTrackActivity.activeTracks

  const shouldTrackAutomationStatus = isPlaying || automationStatus.length > 0

  useEffect(() => {
    if (!shouldTrackAutomationStatus) {
      return
    }

    const interval = window.setInterval(() => {
      const now = Date.now()
      const next = [...groupPulseMetaRef.current.entries()]
        .map(([group_id, meta]) => ({
          group_id,
          track_name: meta.track_name,
          intensity: meta.intensity,
          remaining_ms: Math.max(0, Math.round(meta.ends_at - now)),
        }))
        .filter((entry) => entry.remaining_ms > 0)
      setAutomationStatus(next)
    }, 50)

    return () => window.clearInterval(interval)
  }, [shouldTrackAutomationStatus])

  useEffect(() => {
    if (isPlaying) {
      return
    }

    lastTriggeredGroupRef.current = null
    for (const timer of groupPulseTimersRef.current.values()) {
      window.clearTimeout(timer)
    }
    groupPulseTimersRef.current.clear()
    for (const timerId of stepTimerIdsRef.current) {
      window.clearTimeout(timerId)
    }
    stepTimerIdsRef.current = []
    for (const timerId of demoFallbackTimersRef.current) {
      window.clearTimeout(timerId)
    }
    demoFallbackTimersRef.current = []
    groupPulseMetaRef.current.clear()
    lastGroupPulseKeysRef.current.clear()
    setAutomationStatus([])
    setActiveLightingGroup(null)
  }, [isPlaying])

  const pulseBinding = useCallback((binding: LightingTrackBinding) => {
    if (!dmxBridgeUrl) {
      return
    }

    setActiveLightingGroup(binding.group_id)
    lastTriggeredGroupRef.current = binding.group_id
    const intensity = Math.max(0, Math.min(255, binding.intensity ?? 180))
    const holdMs = Math.max(50, Math.min(2000, binding.hold_ms ?? 150))
    const fadeMs = Math.max(0, Math.min(1000, binding.fade_ms ?? 30))
    groupPulseMetaRef.current.set(binding.group_id, {
      track_name: binding.track_name,
      intensity,
      ends_at: Date.now() + holdMs,
    })

    void postGroupIntensity(dmxBridgeUrl, binding.group_id, intensity, colorForBinding(binding)).catch(() => undefined)

    const existingTimer = groupPulseTimersRef.current.get(binding.group_id)
    if (existingTimer) {
      window.clearTimeout(existingTimer)
    }

    const releaseTimer = window.setTimeout(() => {
      const fadeSteps = fadeMs > 0 ? Math.max(1, Math.round(fadeMs / 50)) : 1
      const nextStepTimerIds: number[] = []
      for (let step = 1; step <= fadeSteps; step += 1) {
        const stepTimerId = window.setTimeout(() => {
          const nextIntensity = Math.max(0, Math.round(intensity * (1 - step / fadeSteps)))
          void postGroupIntensity(dmxBridgeUrl, binding.group_id, nextIntensity, colorForBinding(binding)).catch(() => undefined)
          if (step === fadeSteps) {
            groupPulseMetaRef.current.delete(binding.group_id)
            stepTimerIdsRef.current = stepTimerIdsRef.current.filter((timerId) => timerId !== stepTimerId)
          }
        }, step * Math.max(1, Math.floor(fadeMs / Math.max(1, fadeSteps))))
        nextStepTimerIds.push(stepTimerId)
      }
      stepTimerIdsRef.current.push(...nextStepTimerIds)
      groupPulseTimersRef.current.delete(binding.group_id)
    }, holdMs)

    groupPulseTimersRef.current.set(binding.group_id, releaseTimer)
  }, [dmxBridgeUrl])

  const triggerTrack = useCallback((trackName: string) => {
    if (!isPlaying) {
      return
    }

    const bindings = lighting.group_bindings.filter((binding) => binding.track_name === trackName)
    if (bindings.length === 0) {
      return
    }

    lastRealTriggerAtRef.current = Date.now()
    for (const binding of bindings) {
      pulseBinding(binding)
    }
  }, [isPlaying, lighting.group_bindings, pulseBinding])

  useEffect(() => {
    for (const trackName of stableTrackActivity.activeTracks) {
      lastGroupPulseKeysRef.current.add(`${trackName}:${stableTrackActivity.cycleStart}`)
    }
  }, [stableTrackActivity.activeTracks, stableTrackActivity.cycleStart])

  useEffect(() => {
    if (!isPlaying || !dmxBridgeUrl || lighting.group_bindings.length === 0) {
      return
    }

    const stepMs = Math.max(90, Math.min(420, (cycleInfo?.cycleDurationMs ?? 1000) / 8))
    const tick = () => {
      if (latestActiveTracksRef.current.length > 0) {
        return
      }
      if (Date.now() - lastRealTriggerAtRef.current < 1500) {
        return
      }

      const step = fallbackStepRef.current % 8
      fallbackStepRef.current += 1
      const trackNames = demoTracksForStep(step)
      const bindings = lighting.group_bindings.filter((binding) => trackNames.includes(binding.track_name))

      for (const binding of bindings) {
        pulseBinding(binding)
      }
    }

    tick()
    const interval = window.setInterval(tick, stepMs)
    demoFallbackTimersRef.current.push(interval)

    return () => {
      for (const timerId of demoFallbackTimersRef.current) {
        window.clearTimeout(timerId)
      }
      demoFallbackTimersRef.current = []
    }
  }, [cycleInfo?.cycleDurationMs, dmxBridgeUrl, isPlaying, lighting.group_bindings, pulseBinding])

  return {
    activeLightingGroup,
    automationStatus,
    triggerTrack,
  }
}
