/**
 * DawPanel — Collapsible accordion sidebar for the DAW workspace.
 *
 * // What changed (Sprint 2):
 * // - BUG FIX: Version History section now renders real VersionHistoryPanel
 * //   instead of placeholder stub, via new versionPanel prop
 * // - AnimatedSection rewritten with ResizeObserver for accurate height
 * //   measurement — dynamic duration proportional to content height, no more
 * //   max-height: 2000px hack
 * // - Respects prefers-reduced-motion (0ms duration when enabled)
 * // - Badges added: Arrange (section markers), FX Rack (effect count),
 * //   Version History (snapshot count)
 * // - Mixer slider value popover: floating tooltip above thumb during drag
 * // - sections prop now destructured and used for Arrange badge
 */

import { Link } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo, useRef, type ComponentProps } from 'react'
import { FolderKanban, Sliders, Disc, LayoutGrid, SlidersHorizontal, Clock, ChevronDown, ChevronsUpDown, Lightbulb } from 'lucide-react'
import ArrangePanel from '@/components/ArrangePanel'
import DmxControlPanel from '@/components/DmxControlPanel'
import FxRack from '@/components/FxRack'
import RhythmGenerator from '@/components/RhythmGenerator'
import VersionHistoryPanel from '@/components/VersionHistoryPanel'
import { Button } from '@/components/ui/button'
import { parseTracks, type ParsedTrack } from '@/lib/codeParser'
import type { DmxVisualizationData, VisualizationMode } from '@/components/visualization/types'
import { parseTrackGains } from '@/lib/codeParser'
import type { TrackGain } from '@/lib/codeParser'
import type { CycleInfo } from '@/components/StrudelEditor'
import type { ExtractedParam, LightingProjectState, Project, SectionMarker } from '@/types/project'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DawPanelProps {
  project: Project
  sections: SectionMarker[]
  params: ExtractedParam[]
  isEditorInitialized: boolean
  isEditorInitializing: boolean
  cycleInfo: CycleInfo | null
  onBpmChange: (bpm: number) => void
  onKeyChange: (key: string) => void
  shareUrl: string | null
  shareError: string | null
  isSharing: boolean
  pendingPatchCount: number
  dmxVisualizationData: DmxVisualizationData | null
  dmxBridgeUrl: string | null
  visualizationEnabled: boolean
  visualizationMode: VisualizationMode
  lighting: LightingProjectState
  automationStatus: Array<{ group_id: string; track_name: string; intensity: number; remaining_ms: number }>
  onTrackGainChange: (tg: TrackGain, value: number) => void
  onTrackGainCommit: (tg: TrackGain, value: number) => void
  onTrackPanChange: (tg: TrackGain, value: number) => void
  onTrackPanCommit: (tg: TrackGain, value: number) => void
  onInjectCode: (snippet: string) => void
  onApplyCode: (code: string) => void
  onVisualizationModeChange: (mode: VisualizationMode) => void
  onLightingChange: (lighting: LightingProjectState) => void
  onRefreshDmx: () => void
  versionPanel: ComponentProps<typeof VersionHistoryPanel>
}

interface SectionHeaderProps {
  icon: React.ReactNode
  label: string
  badge?: number | string
  isOpen: boolean
  onToggle: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'shoedelussy:sidebarSections'
const LEGACY_STORAGE_KEY = 'strudelussy:sidebarSections'
const FX_PATTERN = /\.(room|delay|reverb|crush|distort|lpf|hpf)\b/g

type SectionId = 'mixer' | 'rhythm' | 'arrange' | 'fx' | 'dmx' | 'versionHistory'

const DEFAULT_OPEN_STATE: Record<SectionId, boolean> = {
  mixer: true,
  rhythm: false,
  arrange: false,
  fx: false,
  dmx: true,
  versionHistory: false,
}

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read persisted section state from localStorage, falling back to defaults. */
function loadSectionState(): Record<SectionId, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw) {
      if (localStorage.getItem(STORAGE_KEY) === null) {
        localStorage.setItem(STORAGE_KEY, raw)
      }
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_OPEN_STATE, ...(parsed as Record<string, boolean>) }
      }
    }
  } catch {
    // Corrupted or unavailable — fall through to defaults
  }
  return { ...DEFAULT_OPEN_STATE }
}

/** Persist section state to localStorage. */
function saveSectionState(state: Record<SectionId, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

function SectionHeader({ icon, label, badge, isOpen, onToggle }: SectionHeaderProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onToggle()
      }
    },
    [onToggle],
  )

  return (
    <div
      role="button"
      aria-expanded={isOpen}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer select-none items-center gap-2 border-b border-[var(--ussy-divider)] px-3 py-2.5 transition-colors hover:bg-[var(--ussy-surface-2)]"
    >
      {/* Icon */}
      <span className="flex-shrink-0 text-[var(--ussy-text-muted)]">{icon}</span>

      {/* Label */}
      <span className="flex-1 text-xs font-semibold uppercase tracking-widest text-[var(--ussy-text)]">
        {label}
      </span>

      {/* Optional badge */}
      {badge !== undefined && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ussy-surface-2)] px-1.5 text-[10px] font-medium tabular-nums text-[var(--ussy-text-muted)]">
          {badge}
        </span>
      )}

      {/* Chevron — rotates when open */}
      <ChevronDown
        className={`ussy-chevron h-4 w-4 flex-shrink-0 text-[var(--ussy-text-faint)] transition-transform duration-200 ${
          isOpen ? 'ussy-chevron-open rotate-180' : ''
        }`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// AnimatedSection — ResizeObserver-driven height measurement
// ---------------------------------------------------------------------------

function AnimatedSection({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    // Initial measurement
    setMeasuredHeight(el.scrollHeight)

    // Enable transitions after initial measurement to prevent flash
    const frame = requestAnimationFrame(() => setReady(true))

    const ro = new ResizeObserver(() => {
      setMeasuredHeight(el.scrollHeight)
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  // Dynamic duration: faster for short content, proportional for tall
  const duration = PREFERS_REDUCED_MOTION
    ? 0
    : Math.min(250, Math.max(120, measuredHeight * 0.4))

  return (
    <div
      style={{
        maxHeight: isOpen ? (measuredHeight > 0 ? `${measuredHeight}px` : '9999px') : '0px',
        overflow: 'hidden',
        transition: ready
          ? `max-height ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`
          : 'none',
      }}
    >
      <div ref={contentRef} className="p-3">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slider value popover type
// ---------------------------------------------------------------------------

interface ActiveSlider {
  trackId: string
  value: number
  type: 'gain' | 'pan'
}

// ---------------------------------------------------------------------------
// DawPanel
// ---------------------------------------------------------------------------

const DawPanel = ({
  project,
  sections,
  shareUrl,
  shareError,
  isSharing,
  pendingPatchCount,
  dmxVisualizationData,
  dmxBridgeUrl,
  visualizationEnabled,
  visualizationMode,
  lighting,
  automationStatus,
  onTrackGainChange,
  onTrackGainCommit,
  onTrackPanChange,
  onTrackPanCommit,
  onInjectCode,
  onApplyCode,
  onVisualizationModeChange,
  onLightingChange,
  onRefreshDmx,
  versionPanel,
}: DawPanelProps) => {
  // ---- Section open/closed state with localStorage persistence ----
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(loadSectionState)
  const [activeSlider, setActiveSlider] = useState<ActiveSlider | null>(null)

  // Persist whenever openSections changes (after initial load)
  useEffect(() => {
    saveSectionState(openSections)
  }, [openSections])

  const toggleSection = useCallback((id: SectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // Stable per-section toggle callbacks for memoized child components
  const toggleMixer = useCallback(() => toggleSection('mixer'), [toggleSection])
  const toggleRhythm = useCallback(() => toggleSection('rhythm'), [toggleSection])
  const toggleArrange = useCallback(() => toggleSection('arrange'), [toggleSection])
  const toggleFx = useCallback(() => toggleSection('fx'), [toggleSection])
  const toggleDmx = useCallback(() => toggleSection('dmx'), [toggleSection])
  const toggleVersionHistory = useCallback(() => toggleSection('versionHistory'), [toggleSection])

  // Stable no-op for collapsed/onToggle props that are preserved but unused
  const noop = useCallback(() => {}, [])

  // ---- Collapse All / Expand All ----
  const allOpen = Object.values(openSections).every(Boolean)

  const toggleAll = useCallback(() => {
    const target = !allOpen
    setOpenSections((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next) as SectionId[]) {
        next[key] = target
      }
      return next
    })
  }, [allOpen])

  // ---- Derived data (memoized; re-parsed only when the code changes) ----
  const trackGains = useMemo(() => parseTrackGains(project.strudel_code), [project.strudel_code])
  const trackCandidates = useMemo<ParsedTrack[]>(() => parseTracks(project.strudel_code), [project.strudel_code])
  const fxCount = useMemo(() => (project.strudel_code.match(FX_PATTERN) || []).length, [project.strudel_code])
  const sectionCount = sections.length
  const versionCount = versionPanel.versions.length

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* ---- Collapse / Expand All ---- */}
      <div className="flex items-center justify-end border-b border-[var(--ussy-divider)] px-3 py-1.5">
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-1 text-[11px] text-[var(--ussy-text-muted)] transition-colors hover:text-[var(--ussy-text)]"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {allOpen ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {/* ---- Accordion sections ---- */}
      <div className="flex-1">
        {/* 1. Mixer */}
        <SectionHeader
          icon={<Sliders className="h-4 w-4" />}
          label="Mixer"
          badge={trackGains.length}
          isOpen={openSections.mixer}
          onToggle={toggleMixer}
        />
        <AnimatedSection isOpen={openSections.mixer}>
          {trackGains.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--ussy-divider)] px-3 py-3 text-center text-xs text-[var(--ussy-text-faint)]">
              No tracks detected
            </p>
          ) : (
            <div className="space-y-2">
              {trackGains.map((tg) => (
                <div
                  key={tg.trackId}
                  className="rounded-xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-3 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="max-w-[160px] truncate text-sm font-medium text-[var(--ussy-text)]"
                      title={tg.trackName}
                    >
                      {tg.trackName}
                    </span>
                    <span className="tabular-nums text-xs text-[var(--ussy-text-muted)]">
                      {tg.gain.toFixed(2)}
                    </span>
                  </div>

                  {/* Gain slider with popover */}
                  <div className="relative mt-1.5">
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.01}
                      value={tg.gain}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        onTrackGainChange(tg, val)
                        if (activeSlider?.trackId === tg.trackId && activeSlider.type === 'gain') {
                          setActiveSlider({ trackId: tg.trackId, value: val, type: 'gain' })
                        }
                      }}
                      onPointerDown={() =>
                        setActiveSlider({ trackId: tg.trackId, value: tg.gain, type: 'gain' })
                      }
                      onPointerUp={(e) => {
                        onTrackGainCommit(tg, Number((e.currentTarget as HTMLInputElement).value))
                        setActiveSlider(null)
                      }}
                      className="w-full accent-[var(--ussy-accent)]"
                      aria-label={`${tg.trackName} gain`}
                    />
                    {activeSlider?.trackId === tg.trackId && activeSlider.type === 'gain' && (
                      <div
                        className="pointer-events-none absolute -top-6 rounded bg-[var(--ussy-surface-3)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--ussy-text)] shadow-md"
                        style={{
                          left: `${(activeSlider.value / 1.5) * 100}%`,
                          transform: 'translateX(-50%)',
                        }}
                      >
                        {activeSlider.value.toFixed(2)}
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-widest text-[var(--ussy-text-faint)]">
                      Pan
                    </span>
                    <span className="tabular-nums text-xs text-[var(--ussy-text-muted)]">
                      {tg.pan.toFixed(2)}
                    </span>
                  </div>

                  {/* Pan slider with popover */}
                  <div className="relative mt-1">
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={tg.pan}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        onTrackPanChange(tg, val)
                        if (activeSlider?.trackId === tg.trackId && activeSlider.type === 'pan') {
                          setActiveSlider({ trackId: tg.trackId, value: val, type: 'pan' })
                        }
                      }}
                      onPointerDown={() =>
                        setActiveSlider({ trackId: tg.trackId, value: tg.pan, type: 'pan' })
                      }
                      onPointerUp={(e) => {
                        onTrackPanCommit(tg, Number((e.currentTarget as HTMLInputElement).value))
                        setActiveSlider(null)
                      }}
                      className="w-full accent-[var(--ussy-accent)]"
                      aria-label={`${tg.trackName} pan`}
                    />
                    {activeSlider?.trackId === tg.trackId && activeSlider.type === 'pan' && (
                      <div
                        className="pointer-events-none absolute -top-6 rounded bg-[var(--ussy-surface-3)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--ussy-text)] shadow-md"
                        style={{
                          left: `${((activeSlider.value + 1) / 2) * 100}%`,
                          transform: 'translateX(-50%)',
                        }}
                      >
                        {activeSlider.value.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AnimatedSection>

        {/* 2. Rhythm Generator */}
        <SectionHeader
          icon={<Disc className="h-4 w-4" />}
          label="Rhythm Generator"
          isOpen={openSections.rhythm}
          onToggle={toggleRhythm}
        />
        <AnimatedSection isOpen={openSections.rhythm}>
          <RhythmGenerator collapsed={false} onToggle={noop} onInjectCode={onInjectCode} />
        </AnimatedSection>

        {/* 3. Arrange */}
        <SectionHeader
          icon={<LayoutGrid className="h-4 w-4" />}
          label="Arrange"
          badge={sectionCount > 0 ? sectionCount : undefined}
          isOpen={openSections.arrange}
          onToggle={toggleArrange}
        />
        <AnimatedSection isOpen={openSections.arrange}>
          <ArrangePanel
            code={project.strudel_code}
            collapsed={false}
            onToggle={noop}
            onApplyCode={onApplyCode}
          />
        </AnimatedSection>

        {/* 4. FX Rack */}
        <SectionHeader
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label="FX Rack"
          badge={fxCount > 0 ? fxCount : undefined}
          isOpen={openSections.fx}
          onToggle={toggleFx}
        />
        <AnimatedSection isOpen={openSections.fx}>
          <FxRack
            code={project.strudel_code}
            collapsed={false}
            onToggle={noop}
            onApplyCode={onApplyCode}
          />
        </AnimatedSection>

        <SectionHeader
          icon={<Lightbulb className="h-4 w-4" />}
          label="DMX Monitor"
          badge={dmxVisualizationData ? dmxVisualizationData.scenes.length : undefined}
          isOpen={openSections.dmx}
          onToggle={toggleDmx}
        />
        <AnimatedSection isOpen={openSections.dmx}>
          <DmxControlPanel
            data={dmxVisualizationData}
            bridgeUrl={dmxBridgeUrl}
            visualizationEnabled={visualizationEnabled}
            visualizationMode={visualizationMode}
            lighting={lighting}
            automationStatus={automationStatus}
            sectionCandidates={sections}
            trackCandidates={trackCandidates}
            onVisualizationModeChange={onVisualizationModeChange}
            onLightingChange={onLightingChange}
            onRefresh={onRefreshDmx}
          />
        </AnimatedSection>

        {/* 6. Version History */}
        <SectionHeader
          icon={<Clock className="h-4 w-4" />}
          label="Version History"
          badge={versionCount > 0 ? versionCount : undefined}
          isOpen={openSections.versionHistory}
          onToggle={toggleVersionHistory}
        />
        <AnimatedSection isOpen={openSections.versionHistory}>
          <VersionHistoryPanel {...versionPanel} />
        </AnimatedSection>
      </div>

      {/* ---- Footer (always visible, outside accordion) ---- */}
      <div className="space-y-2 border-t border-[var(--ussy-divider)] p-3">
        {shareUrl ? (
          <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Shared</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-emerald-700/50 bg-transparent px-2 text-xs text-emerald-100 hover:bg-emerald-900/40"
                onClick={() => {
                  if (navigator.clipboard?.writeText) {
                    void navigator.clipboard.writeText(shareUrl)
                  }
                }}
              >
                Copy link
              </Button>
            </div>
            <div className="mt-1 truncate text-emerald-100/80">{shareUrl}</div>
          </div>
        ) : null}

        {shareError ? (
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
            {shareError}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-7 border-[var(--ussy-divider)] bg-transparent px-2 text-xs text-[var(--ussy-text-muted)] hover:bg-[var(--ussy-surface-2)]"
          >
            <Link to="/projects">
              <FolderKanban className="mr-1.5 h-3 w-3" /> Projects
            </Link>
          </Button>
          <span className="text-right text-xs text-[var(--ussy-text-faint)]">
            {isSharing
              ? 'Sharing...'
              : pendingPatchCount > 0
                ? `${pendingPatchCount} patch${pendingPatchCount === 1 ? '' : 'es'} pending`
                : 'No pending patch'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default DawPanel
