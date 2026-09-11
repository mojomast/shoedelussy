/**
 * TransportBar.tsx — Slim bottom-dock transport controls
 *
 * Migrated to Ussy design tokens (CSS custom properties).
 * Single-row layout, ~44px tall, with phase progress as a
 * thin 3px bar along the very bottom edge.
 */

import { Check, PauseCircle, Play, Redo2, Save, Sparkles, Undo2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import VisualizationBar from '@/components/VisualizationBar'
import { Button } from '@/components/ui/button'

interface TransportBarProps {
  isPlaying: boolean
  isSaving: boolean
  isDirty: boolean
  phase: number
  error: string | null
  activeSection: string | null
  activeLightingScene?: string | null
  activeLightingGroup?: string | null
  onPlay: () => void
  onStop: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
}

const TransportBar = ({
  isPlaying,
  isSaving,
  isDirty,
  phase,
  error,
  activeSection,
  activeLightingScene,
  activeLightingGroup,
  onPlay,
  onStop,
  onSave,
  onUndo,
  onRedo,
}: TransportBarProps) => {
  return (
    <Card className="relative min-h-0 overflow-hidden border-[var(--ussy-divider)] bg-[var(--ussy-surface)] text-[var(--ussy-text)] shadow-none lg:col-span-2 2xl:col-span-1">
      <CardContent className="px-3 py-1.5">
        {/* ── Single-row controls ── */}
        <div className="flex h-[44px] items-center gap-2">
          {/* Play / Stop */}
          <Button
            className={`h-8 gap-1.5 bg-[var(--ussy-accent)] px-3 text-xs text-black hover:bg-[var(--ussy-accent-bright)] ${isPlaying ? 'ussy-playing-pulse' : ''}`}
            onClick={isPlaying ? onStop : onPlay}
          >
            {isPlaying ? <PauseCircle className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isPlaying ? 'Stop' : 'Play'}
          </Button>

          {/* Undo */}
          <Button
            variant="outline"
            className="h-8 w-8 border-[var(--ussy-divider)] bg-transparent p-0 text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
            onClick={onUndo}
            aria-label="Undo"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>

          {/* Redo */}
          <Button
            variant="outline"
            className="h-8 w-8 border-[var(--ussy-divider)] bg-transparent p-0 text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
            onClick={onRedo}
            aria-label="Redo"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>

          {/* Save */}
          <Button
            variant="outline"
            className="h-8 gap-1.5 border-[var(--ussy-divider)] bg-transparent px-2.5 text-xs text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
            onClick={onSave}
          >
            {isDirty ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-emerald-400" />}
            {isSaving ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
          </Button>

          {/* Error / status text */}
          <span
            className={`max-w-[180px] truncate rounded-full px-2.5 py-1 text-[10px] leading-tight ${
              error ? 'bg-red-950/70 text-red-300' : 'bg-[var(--ussy-surface-2)] text-[var(--ussy-text-muted)]'
            }`}
            role={error ? 'alert' : undefined}
          >
            {error ? `Attention: ${error}` : 'Engine ready'}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Active section pill */}
          {activeSection && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[var(--ussy-surface-2)] px-2.5 py-1 text-[10px] text-[var(--ussy-text-muted)] sm:inline-flex">
              {activeSection}
            </span>
          )}

          {activeLightingScene && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-fuchsia-950/40 px-2.5 py-1 text-[10px] text-fuchsia-200 sm:inline-flex">
              Scene: {activeLightingScene}
            </span>
          )}

          {activeLightingGroup && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-cyan-950/40 px-2.5 py-1 text-[10px] text-cyan-200 sm:inline-flex">
              Group: {activeLightingGroup}
            </span>
          )}

          {/* AI status pill (compact) */}
          <div className="hidden shrink-0 items-center gap-1 rounded-full bg-[var(--ussy-surface-2)] px-2.5 py-1 text-[10px] text-[var(--ussy-text-muted)] sm:inline-flex">
            <Sparkles className="h-3 w-3 text-[var(--ussy-accent)]" />
            AI
          </div>

          {/* Visualization bar — hidden below md */}
          <div className="hidden md:block">
            <VisualizationBar isPlaying={isPlaying} phase={phase} />
          </div>
        </div>
      </CardContent>

      {/* ── Phase progress — thin 3px bar pinned to bottom ── */}
      <div
        className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--ussy-surface-2)]"
        role="progressbar"
        aria-valuenow={Math.round(phase * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Playback phase"
      >
        <div
          className="h-full bg-gradient-to-r from-[var(--ussy-accent-dim)] to-[var(--ussy-accent)] transition-all duration-100"
          style={{ width: `${Math.min(100, Math.max(0, phase * 100))}%` }}
        />
      </div>
    </Card>
  )
}

export default TransportBar
