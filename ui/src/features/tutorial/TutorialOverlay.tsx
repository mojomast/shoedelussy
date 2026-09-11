/**
 * // What changed:
 * // - Added spec-aligned spotlight overlays for lessons 1.1 and 1.4 only
 * // - Implemented resize-aware cutout positioning and dismissal persistence
 */

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Lesson } from './tutorialData'

interface TutorialOverlayProps {
  lesson: Lesson
  isOpen: boolean
}

const SEEN_KEY = 'shoedelussy:seenOverlays'
const LEGACY_SEEN_KEY = 'strudelussy:seenOverlays'
const DISABLED_KEY = 'shoedelussy:overlaysDisabled'
const LEGACY_DISABLED_KEY = 'strudelussy:overlaysDisabled'
const DISMISS_COUNT_KEY = 'shoedelussy:overlayDismissCount'
const LEGACY_DISMISS_COUNT_KEY = 'strudelussy:overlayDismissCount'
const STORAGE_KEY = 'shoedelussy:tutorialProgress'
const LEGACY_STORAGE_KEY = 'strudelussy:tutorialProgress'
const LEGACY_STORAGE_KEY_ALT = 'strudelussy_tutorial_progress'

const getStoredValue = (...keys: string[]): string | null => {
  try {
    for (const key of keys) {
      const value = localStorage.getItem(key)
      if (value === null) continue
      if (key !== keys[0]) {
        localStorage.setItem(keys[0], value)
      }
      return value
    }
  } catch {
    return null
  }

  return null
}

const readSeenOverlays = (): string[] => {
  try {
    const progressRaw = getStoredValue(STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_STORAGE_KEY_ALT)
    if (progressRaw) {
      const parsed = JSON.parse(progressRaw) as { seenOverlays?: string[] }
      if (Array.isArray(parsed.seenOverlays)) {
        return parsed.seenOverlays
      }
    }

    const raw = getStoredValue(SEEN_KEY, LEGACY_SEEN_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const overlaysDisabled = (): boolean => {
  try {
    return getStoredValue(DISABLED_KEY, LEGACY_DISABLED_KEY) === 'true'
  } catch {
    return false
  }
}

const readDismissCount = (): number => {
  try {
    return Number(getStoredValue(DISMISS_COUNT_KEY, LEGACY_DISMISS_COUNT_KEY) ?? '0') || 0
  } catch {
    return 0
  }
}

const TutorialOverlay = ({ lesson, isOpen }: TutorialOverlayProps) => {
  const [tick, setTick] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(false)
  }, [lesson.id])

  useEffect(() => {
    if (!isOpen || !lesson.spotlightTarget || (lesson.id !== '1.1' && lesson.id !== '1.4')) {
      return
    }

    const target = document.querySelector(lesson.spotlightTarget)
    if (!(target instanceof Element)) {
      return
    }

    const observer = new ResizeObserver(() => setTick((value) => value + 1))
    observer.observe(target)

    const handleResize = () => setTick((value) => value + 1)
    window.addEventListener('resize', handleResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen, lesson.id, lesson.spotlightTarget])

  const rect = useMemo(() => {
    if (!isOpen || !lesson.spotlightTarget || (lesson.id !== '1.1' && lesson.id !== '1.4')) {
      return null
    }
    if (dismissed || overlaysDisabled()) {
      return null
    }

    const target = document.querySelector(lesson.spotlightTarget)
    return target instanceof HTMLElement ? target.getBoundingClientRect() : null
  }, [dismissed, isOpen, lesson.id, lesson.spotlightTarget, tick])

  if (!rect) {
    return null
  }

  const dismissOverlay = () => {
    setDismissed(true)
    try {
      const nextSeen = Array.from(new Set([...readSeenOverlays(), lesson.id]))
      const dismissCount = readDismissCount() + 1
      const progressRaw = localStorage.getItem(STORAGE_KEY)
      const parsed = progressRaw ? JSON.parse(progressRaw) as Record<string, unknown> : {}
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, seenOverlays: nextSeen }))
      localStorage.setItem(SEEN_KEY, JSON.stringify(nextSeen))
      localStorage.setItem(DISMISS_COUNT_KEY, String(dismissCount))
      if (dismissCount >= 3) {
        localStorage.setItem(DISABLED_KEY, 'true')
      }
    } catch {
      // Ignore storage failures and continue in-memory.
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 0 0 100vmax oklch(0 0 0 / 0.7)',
          // Let clicks pass through to the control being highlighted.
          pointerEvents: 'none',
        }}
      />
      <div
        className="max-w-xs rounded-[var(--radius-lg)] border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] p-4 text-left text-sm text-[var(--ussy-text)] shadow-lg"
        style={{ position: 'absolute', top: rect.bottom + 12, left: rect.left, pointerEvents: 'auto' }}
      >
        <p>{lesson.hints[0]}</p>
        <Button
          type="button"
          size="sm"
          className="mt-3 border border-[var(--ussy-divider)] bg-[var(--ussy-accent)] text-[var(--ussy-bg)] hover:bg-[var(--ussy-accent-bright)]"
          onClick={dismissOverlay}
          aria-label="Dismiss tutorial spotlight"
        >
          Got it
        </Button>
      </div>
    </div>
  )
}

export default TutorialOverlay
