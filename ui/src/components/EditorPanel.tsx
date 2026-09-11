/**
 * // What changed:
 * // - Preserved the editor bridge API used for tutorial code injection and reads
 * // - Left editor wiring unchanged so tutorial integration consumes the existing bridge cleanly
 */

import { forwardRef, useEffect, useRef } from 'react'
import { Shuffle, Sparkles, Waves, Wand2 } from 'lucide-react'
import StrudelEditor, { type CycleInfo, type TrackTriggerEvent } from '@/components/StrudelEditor'
import SectionStrip from '@/components/SectionStrip'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import VisualizationSurface from '@/components/visualization/VisualizationSurface'
import type { DmxVisualizationData, VisualizationMode } from '@/components/visualization/types'
import type { Project, SectionMarker } from '@/types/project'

export interface EditorBridge {
  play: () => void
  stop: () => void
  evaluate: () => void
  undo: () => void
  redo: () => void
  setCode: (code: string) => void
  setMasterVolume: (volume: number) => void
  getCode: () => string
  getCycleInfo: () => CycleInfo | null
  getTrackActivity: () => { activeTracks: string[]; cycleStart: number; cycleEnd: number }
  jumpToLine: (line: number) => void
}

interface EditorPanelProps {
  project: Project
  sections: SectionMarker[]
  activeSection: string | null
  activeLightingScene?: string | null
  activeLightingGroup?: string | null
  isPlaying: boolean
  showVisualization: boolean
  audioAnalyser?: AnalyserNode | null
  visualizationMode?: VisualizationMode
  dmxVisualizationData?: DmxVisualizationData | null
  dmxBridgeUrl?: string | null
  isEditorInitialized: boolean
  isEditorInitializing: boolean
  cycleInfo: CycleInfo | null
  onEditorReady: (bridge: Partial<EditorBridge>) => void
  onAnalyserReady?: (analyser: AnalyserNode) => void
  onCodeChange: (code: string) => void
  onEditorActivity?: () => void
  onPlayStateChange: (isPlaying: boolean) => void
  onInitStateChange: (initialized: boolean, initializing: boolean) => void
  onStrudelError: (error: string) => void
  onCodeEvaluated: () => void
  onTrackTrigger?: (event: TrackTriggerEvent) => void
  onSelectSection: (section: SectionMarker) => void
  onShuffleRhythm: () => void
  onAddVariation: () => void
  onRandomReverb: () => void
  onJuxRev: () => void
}

const EditorPanel = forwardRef<HTMLDivElement, EditorPanelProps>((
  {
    project, sections, activeSection, activeLightingScene, activeLightingGroup, isPlaying, showVisualization, audioAnalyser, visualizationMode = 'hal', dmxVisualizationData, dmxBridgeUrl,
    onEditorReady, onAnalyserReady, onCodeChange, onEditorActivity, onPlayStateChange, onInitStateChange,
    onStrudelError, onCodeEvaluated, onTrackTrigger, onSelectSection,
    onShuffleRhythm, onAddVariation, onRandomReverb, onJuxRev,
  },
  editorContainerRef,
) => {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = rootRef.current
    if (!node || !onEditorActivity) {
      return
    }

    const handleInput = () => onEditorActivity()
    node.addEventListener('input', handleInput, true)
    return () => node.removeEventListener('input', handleInput, true)
  }, [onEditorActivity])

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col gap-2">
      <div
        ref={editorContainerRef}
        className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-800/70 bg-black/35 p-2 backdrop-blur-sm sm:p-3"
      >
        {showVisualization ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
            <VisualizationSurface
              mode={visualizationMode}
              isPlaying={isPlaying}
              audioAnalyser={audioAnalyser}
              dmxData={dmxVisualizationData}
              dmxBridgeUrl={dmxBridgeUrl}
            />
          </div>
        ) : null}

        <div className="relative z-10 h-full">
          <StrudelEditor
            initialCode={project.strudel_code}
            onCodeChange={onCodeChange}
            onPlayReady={(play) => onEditorReady({ play })}
            onStopReady={(stop) => onEditorReady({ stop })}
            onUndoReady={(undo) => onEditorReady({ undo })}
            onRedoReady={(redo) => onEditorReady({ redo })}
            onGetCurrentCode={(getCode) => onEditorReady({ getCode })}
            onEvaluateReady={(evaluate) => onEditorReady({ evaluate })}
            onSetCodeReady={(setCode) => onEditorReady({ setCode })}
            onMasterVolumeReady={(setMasterVolume) => onEditorReady({ setMasterVolume })}
            onCycleInfoReady={(getCycleInfo) => onEditorReady({ getCycleInfo })}
            onTrackActivityReady={(getTrackActivity) => onEditorReady({ getTrackActivity })}
            onJumpToLineReady={(jumpToLine) => onEditorReady({ jumpToLine })}
            onAnalyserReady={onAnalyserReady}
            onPlayStateChange={onPlayStateChange}
            onInitStateChange={onInitStateChange}
            onStrudelError={(error) => onStrudelError(error)}
            onCodeEvaluated={onCodeEvaluated}
            onTrackTrigger={onTrackTrigger}
          />
        </div>
      </div>
      <Card className="shrink-0 border-zinc-900 bg-black/40 shadow-none">
        <CardContent className="space-y-2 p-3">
          <SectionStrip
            sections={sections}
            activeSection={activeSection}
            code={project.strudel_code}
            onSelect={onSelectSection}
          />
          <div className="flex flex-wrap gap-1.5">
            {activeLightingScene ? (
              <span className="inline-flex h-7 items-center rounded-full border border-fuchsia-800/50 bg-fuchsia-950/30 px-2.5 text-[10px] uppercase tracking-[0.16em] text-fuchsia-200">
                Scene {activeLightingScene}
              </span>
            ) : null}
            {activeLightingGroup ? (
              <span className="inline-flex h-7 items-center rounded-full border border-cyan-800/50 bg-cyan-950/30 px-2.5 text-[10px] uppercase tracking-[0.16em] text-cyan-200">
                Group {activeLightingGroup}
              </span>
            ) : null}
            <Button variant="outline" size="sm" className="h-7 border-zinc-700 bg-transparent px-2 text-xs text-zinc-200 hover:bg-zinc-900" onClick={onShuffleRhythm}>
              <Shuffle className="mr-1 h-3 w-3" /> Shuffle
            </Button>
            <Button variant="outline" size="sm" className="h-7 border-zinc-700 bg-transparent px-2 text-xs text-zinc-200 hover:bg-zinc-900" onClick={onAddVariation}>
              <Sparkles className="mr-1 h-3 w-3" /> Variation
            </Button>
            <Button variant="outline" size="sm" className="h-7 border-zinc-700 bg-transparent px-2 text-xs text-zinc-200 hover:bg-zinc-900" onClick={onRandomReverb}>
              <Waves className="mr-1 h-3 w-3" /> Reverb
            </Button>
            <Button variant="outline" size="sm" className="h-7 border-zinc-700 bg-transparent px-2 text-xs text-zinc-200 hover:bg-zinc-900" onClick={onJuxRev}>
              <Wand2 className="mr-1 h-3 w-3" /> Jux Rev
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})

EditorPanel.displayName = 'EditorPanel'

export default EditorPanel
