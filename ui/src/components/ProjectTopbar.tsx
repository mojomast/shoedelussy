/**
 * ProjectTopbar – v2 (slim single-row topbar with settings drawer)
 *
 * // What changed (Sprint 2 — Phase 3):
 * // - BPM read-only pill replaced with 60px number input, wired to onBpmChange
 * // - Key text input (80px) added after BPM input, wired to onKeyChange
 * // - Token pill format: "≈8.2k" prefix with ≈, "tok" suffix removed
 * // - Token pill pulsing red when approxTokenUsage >= 14000
 * // - Model selector max-width reduced to 160px, title tooltip for overflow
 * // - Escape key closes drawer when open
 * // - Active tab badge shown on gear button when drawer is open
 * // - New props: bpm, projectKey, onBpmChange, onKeyChange
 * // - All existing props preserved
 */

import { useCallback, useEffect, useState } from 'react'
import type { SavedPromptPreset, SystemPromptMode } from '@/types/project'
import type { VisualizationMode } from '@/components/visualization/types'
import { Disc3, Settings, HelpCircle, FolderKanban } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

// ── Constants ────────────────────────────────────────────────────
const SOURCE_REPO_URL = 'https://github.com/mojomast/shoedelussy'
const LICENSE_URL = 'https://github.com/mojomast/shoedelussy/blob/main/LICENSE'
const DISCLOSURE_URL = 'https://github.com/mojomast/shoedelussy/blob/main/docs/STRUDEL_SOURCE_DISCLOSURE.md'

// ── Types ────────────────────────────────────────────────────────
type DrawerTab = 'ai' | 'prompts' | 'api' | 'export'

interface ProjectTopbarProps {
  projectName: string
  masterVolume: number
  customApiEndpoint: string
  customApiKey: string
  customSystemPrompt: string
  promptPresetName: string
  savedPromptPresets: SavedPromptPreset[]
  selectedModel: string
  systemPromptMode: SystemPromptMode
  availableModels: string[]
  isLoadingModels: boolean
  modelLoadError: string | null
  isSharing: boolean
  approxTokenUsage: number
  showVisualization: boolean
  visualizationMode: VisualizationMode
  bpm?: number | null
  projectKey?: string | null
  onProjectNameChange: (name: string) => void
  onMasterVolumeChange: (volume: number) => void
  onCustomApiEndpointChange: (endpoint: string) => void
  onCustomApiKeyChange: (apiKey: string) => void
  onCustomSystemPromptChange: (prompt: string) => void
  onLoadDefaultPromptTemplate: () => void
  onLoadImprovedPromptTemplate: () => void
  onPromptPresetNameChange: (label: string) => void
  onSavePromptPreset: () => void
  onLoadSavedPromptPreset: (content: string) => void
  onModelChange: (model: string) => void
  onSystemPromptModeChange: (mode: SystemPromptMode) => void
  onLoadModels: () => void
  onToggleVisualization: () => void
  onVisualizationModeChange: (mode: VisualizationMode) => void
  onNewProject: () => void
  onLoadDemo: () => void
  onExportTxt: () => void
  onExportProject: () => void
  onShare: () => void
  onToggleShortcuts: () => void
  onBpmChange?: (bpm: number) => void
  onKeyChange?: (key: string) => void
  saveStatus?: 'saving' | 'unsaved' | 'saved' | 'local-error'
  pendingPatchCount?: number
  shareStatus?: string | null
}

// ── Shared input class ───────────────────────────────────────────
const inputClass =
  'h-7 rounded-lg border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-2 text-xs text-[var(--ussy-text)] outline-none transition focus:border-[var(--ussy-accent)]'

// ── Helpers ──────────────────────────────────────────────────────

/** Return the CSS class for the token-usage colour tier. */
function tokenPillClass(tokens: number): string {
  if (tokens >= 14_000) return 'ussy-token-red'
  if (tokens >= 10_000) return 'ussy-token-amber'
  if (tokens >= 6_000) return 'ussy-token-yellow'
  return 'ussy-token-green'
}

/** Format token count as a human-readable string, e.g. "≈8.2k". */
function formatTokens(tokens: number): string {
  return `≈${(Math.round(tokens / 100) / 10).toFixed(1)}k`
}

// ── Drawer tab definitions ───────────────────────────────────────
const DRAWER_TABS: { id: DrawerTab; label: string }[] = [
  { id: 'ai', label: 'AI Settings' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'api', label: 'API' },
  { id: 'export', label: 'Export & Share' },
]

// ── Component ────────────────────────────────────────────────────

const ProjectTopbar = ({
  projectName,
  masterVolume,
  customApiEndpoint,
  customApiKey,
  customSystemPrompt,
  promptPresetName,
  savedPromptPresets,
  selectedModel,
  systemPromptMode,
  availableModels,
  isLoadingModels,
  modelLoadError,
  isSharing,
  approxTokenUsage,
  showVisualization,
  visualizationMode,
  bpm,
  projectKey,
  onProjectNameChange,
  onMasterVolumeChange,
  onCustomApiEndpointChange,
  onCustomApiKeyChange,
  onCustomSystemPromptChange,
  onLoadDefaultPromptTemplate,
  onLoadImprovedPromptTemplate,
  onPromptPresetNameChange,
  onSavePromptPreset,
  onLoadSavedPromptPreset,
  onModelChange,
  onSystemPromptModeChange,
  onLoadModels,
  onToggleVisualization,
  onVisualizationModeChange,
  onNewProject,
  onLoadDemo,
  onExportTxt,
  onExportProject,
  onShare,
  onToggleShortcuts,
  onBpmChange,
  onKeyChange,
  saveStatus = 'saved',
  pendingPatchCount = 0,
  shareStatus,
}: ProjectTopbarProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<DrawerTab>('ai')

  // ── ⌘, keyboard shortcut to toggle drawer + Escape to close ───
  const toggleDrawer = useCallback(() => setDrawerOpen((prev) => !prev), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        toggleDrawer()
      }
      if (e.key === 'Escape' && drawerOpen) {
        e.preventDefault()
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleDrawer, drawerOpen])

  // ── Derived values ─────────────────────────────────────────────
  const apiStatusText =
    customApiEndpoint && customApiKey
      ? 'Custom provider fields are populated'
      : 'Using built-in OpenRouter Gemini 2.5 Flash'
  const modelStatusText = modelLoadError ?? (isLoadingModels ? 'Loading models…' : 'Model list ready')

  // Active tab label for gear button badge
  const activeTabLabel = DRAWER_TABS.find((t) => t.id === activeTab)?.label ?? ''

  // Token pulse class — pulse when red tier
  const tokenPulseClass = approxTokenUsage >= 14_000 ? 'ussy-token-red-pulse' : ''

  // ── Render ─────────────────────────────────────────────────────
  return (
    <header className="rounded-xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface)] backdrop-blur-xl">
      {/* ──────────── Slim top row (40 px) ──────────── */}
      <div className="flex h-10 items-center gap-2 px-3">
        {/* 1. Logo icon */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 text-black shadow-[0_0_20px_rgba(139,92,246,0.2)]">
          <Disc3 className="h-3.5 w-3.5" />
        </div>

        {/* 2. Brand label */}
        <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--ussy-text-muted)]">
          shoedelussy
        </span>

        {/* Divider */}
        <div className="h-4 w-px shrink-0 bg-[var(--ussy-divider)]" />

        {/* 3. Project name input */}
        <input
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          className={`${inputClass} w-40 min-w-[100px] font-semibold`}
          aria-label="Project name"
        />

        <span
          className={`hidden shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium sm:inline-flex ${saveStatus === 'local-error' ? 'bg-amber-950/70 text-amber-200' : saveStatus === 'unsaved' ? 'bg-purple-950/70 text-purple-200' : saveStatus === 'saving' ? 'bg-cyan-950/70 text-cyan-200' : 'bg-emerald-950/60 text-emerald-200'}`}
          title={saveStatus === 'local-error' ? 'Remote save failed, local copy is preserved' : undefined}
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved' : saveStatus === 'local-error' ? 'Local save' : 'Saved'}
        </span>

        {pendingPatchCount > 0 ? (
          <span className="hidden shrink-0 rounded-md bg-fuchsia-950/70 px-2 py-0.5 text-[10px] font-medium text-fuchsia-200 md:inline-flex">
            {pendingPatchCount} patch{pendingPatchCount === 1 ? '' : 'es'}
          </span>
        ) : null}

        {shareStatus ? (
          <span className="hidden shrink-0 rounded-md bg-cyan-950/70 px-2 py-0.5 text-[10px] font-medium text-cyan-200 lg:inline-flex">
            {shareStatus}
          </span>
        ) : null}

        {/* 4. BPM input */}
        <input
          type="number"
          min={20}
          max={300}
          step={1}
          value={bpm ?? ''}
          placeholder="BPM"
          onChange={(e) => {
            const val = Number(e.target.value)
            if (Number.isFinite(val) && val > 0 && onBpmChange) {
              onBpmChange(val)
            }
          }}
          className={`${inputClass} w-[60px] tabular-nums`}
          aria-label="BPM"
          title="Beats per minute"
        />

        {/* 5. Key input */}
        <input
          type="text"
          value={projectKey ?? ''}
          placeholder="Key"
          onChange={(e) => onKeyChange?.(e.target.value)}
          className={`${inputClass} w-[80px]`}
          aria-label="Musical key"
          title="Musical key (e.g. C major, Am)"
        />

        {/* 6. Model selector dropdown */}
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          className={`${inputClass} max-w-[160px] min-w-[120px]`}
          aria-label="Model selector"
          title={selectedModel}
        >
          {availableModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>

        {/* 7. Play indicator dot */}
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            backgroundColor: showVisualization ? 'var(--ussy-accent)' : 'var(--ussy-text-faint)',
            boxShadow: showVisualization ? '0 0 6px var(--ussy-accent-glow)' : 'none',
          }}
          role="status"
          aria-label={showVisualization ? 'Visualization active' : 'Visualization off'}
          title={showVisualization ? 'Visualization active' : 'Visualization off'}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* 8. Master volume slider (compact) */}
        <label className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-2 text-[10px] text-[var(--ussy-text-muted)]">
          <span>Vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
            className="w-16 accent-[var(--ussy-accent)]"
          />
          <span className="w-7 text-right tabular-nums text-[var(--ussy-text)]">
            {Math.round(masterVolume * 100)}%
          </span>
        </label>

        {/* 9. Token usage pill */}
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium tabular-nums ${tokenPillClass(approxTokenUsage)} ${tokenPulseClass}`}
          title={`≈ ${approxTokenUsage.toLocaleString()} tokens in context`}
        >
          {formatTokens(approxTokenUsage)}
        </span>

        {/* Divider */}
        <div className="h-4 w-px shrink-0 bg-[var(--ussy-divider)]" />

        {/* 10. Settings gear button */}
        <button
          onClick={toggleDrawer}
          className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[var(--ussy-text-muted)] transition hover:bg-[var(--ussy-surface-2)] hover:text-[var(--ussy-text)]"
          aria-label="Toggle settings drawer"
          aria-expanded={drawerOpen}
          title="Settings (⌘,)"
        >
          <Settings className="h-4 w-4" />
          {drawerOpen ? (
            <span className="rounded bg-[var(--ussy-accent)] px-1.5 py-px text-[9px] font-semibold text-black">
              {activeTabLabel}
            </span>
          ) : (
            <kbd className="hidden rounded border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-1 py-px text-[9px] text-[var(--ussy-text-faint)] sm:inline-block">
              ⌘,
            </kbd>
          )}
        </button>

        {/* 11. Shortcuts button */}
        <button
          onClick={onToggleShortcuts}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[var(--ussy-text-muted)] transition hover:bg-[var(--ussy-surface-2)] hover:text-[var(--ussy-text)]"
          aria-label="Toggle keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      {/* ──────────── Settings drawer ──────────── */}
      <div className={`ussy-drawer ${drawerOpen ? 'ussy-drawer-open' : 'ussy-drawer-closed'}`}>
        <div className="border-t border-[var(--ussy-divider)] px-3 pb-3 pt-2">
          {/* Tab bar */}
          <div className="mb-3 flex gap-1 border-b border-[var(--ussy-divider)]" role="tablist" aria-label="Settings tabs">
            {DRAWER_TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === tab.id
                    ? 'text-[var(--ussy-accent)]'
                    : 'text-[var(--ussy-text-muted)] hover:text-[var(--ussy-text)]'
                }`}
              >
                {tab.label}
                {/* Active underline */}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--ussy-accent)]" />
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: AI Settings ── */}
          {activeTab === 'ai' && (
            <div role="tabpanel" aria-label="AI Settings" className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--ussy-text-muted)]">
                <span className="shrink-0">System prompt mode</span>
                <select
                  value={systemPromptMode}
                  onChange={(e) => onSystemPromptModeChange(e.target.value as SystemPromptMode)}
                  className={`${inputClass} min-w-[170px]`}
                >
                  <option value="legacy-toaster">Legacy toaster prompt</option>
                  <option value="shoedelussy">Shoedelussy prompt</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-[var(--ussy-text-muted)]">
                <span className="shrink-0">Model</span>
                <select
                  value={selectedModel}
                  onChange={(e) => onModelChange(e.target.value)}
                  className={`${inputClass} min-w-[200px]`}
                >
                  {availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                size="toolbar"
                variant="outline"
                className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                onClick={onLoadModels}
                disabled={isLoadingModels}
              >
                {isLoadingModels ? 'Loading…' : 'Load Models'}
              </Button>

              <Button
                size="toolbar"
                variant="outline"
                className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                onClick={onToggleVisualization}
              >
                {showVisualization ? 'Viz On' : 'Viz Off'}
              </Button>

              <Button
                size="toolbar"
                variant="outline"
                className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                onClick={() => onVisualizationModeChange(visualizationMode === 'hal' ? 'dmx' : 'hal')}
              >
                {visualizationMode === 'hal' ? 'Mode: HAL' : 'Mode: DMX'}
              </Button>

              {modelLoadError && (
                <span className="text-xs text-red-400">{modelLoadError}</span>
              )}
            </div>
          )}

          {/* ── Tab: Prompts ── */}
          {activeTab === 'prompts' && (
            <div role="tabpanel" aria-label="Prompts" className="flex flex-col gap-3">
              <textarea
                value={customSystemPrompt}
                onChange={(e) => onCustomSystemPromptChange(e.target.value)}
                placeholder="Optional system prompt override"
                className="min-h-[120px] w-full rounded-lg border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-3 py-2 text-xs text-[var(--ussy-text)] outline-none transition focus:border-[var(--ussy-accent)]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                  onClick={onLoadDefaultPromptTemplate}
                >
                  Load Default
                </Button>
                <Button
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                  onClick={onLoadImprovedPromptTemplate}
                >
                  Load Improved
                </Button>

                <div className="h-4 w-px bg-[var(--ussy-divider)]" />

                <select
                  value=""
                  onChange={(e) => {
                    const preset = savedPromptPresets.find((entry) => entry.id === e.target.value)
                    if (preset) onLoadSavedPromptPreset(preset.content)
                  }}
                  className={`${inputClass} min-w-[170px]`}
                >
                  <option value="">Load saved prompt</option>
                  {savedPromptPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>

                <input
                  value={promptPresetName}
                  onChange={(e) => onPromptPresetNameChange(e.target.value)}
                  placeholder="Preset name"
                  className={`${inputClass} min-w-[150px]`}
                />

                <Button
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                  onClick={onSavePromptPreset}
                >
                  Save Prompt
                </Button>
              </div>
            </div>
          )}

          {/* ── Tab: API ── */}
          {activeTab === 'api' && (
            <div role="tabpanel" aria-label="API" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[var(--ussy-text-muted)]">
                  <span className="shrink-0">Endpoint</span>
                  <input
                    value={customApiEndpoint}
                    onChange={(e) => onCustomApiEndpointChange(e.target.value)}
                    placeholder="Custom API endpoint"
                    className={`${inputClass} min-w-[260px]`}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--ussy-text-muted)]">
                  <span className="shrink-0">API Key</span>
                  <input
                    type="password"
                    value={customApiKey}
                    onChange={(e) => onCustomApiKeyChange(e.target.value)}
                    placeholder="Custom API key"
                    className={`${inputClass} min-w-[200px]`}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--ussy-text-muted)]">
                <span>{apiStatusText}</span>
                <span>{modelStatusText}</span>
              </div>
            </div>
          )}

          {/* ── Tab: Export & Share ── */}
          {activeTab === 'export' && (
            <div role="tabpanel" aria-label="Export and Share" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                  onClick={onNewProject}
                >
                  New Project
                </Button>
                <Button
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                  onClick={onLoadDemo}
                >
                  Load Demo
                </Button>
                <Button
                  asChild
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                >
                  <Link to="/projects">
                    <FolderKanban className="mr-1.5 h-3.5 w-3.5" />
                    Projects
                  </Link>
                </Button>

                <div className="h-4 w-px bg-[var(--ussy-divider)]" />

                <Button
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                  onClick={onExportTxt}
                >
                  Export .txt
                </Button>
                <Button
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                  onClick={onExportProject}
                >
                  Export .strudel
                </Button>

                <div className="h-4 w-px bg-[var(--ussy-divider)]" />

                <Button
                  size="toolbar"
                  variant="outline"
                  className="border-[var(--ussy-divider)] bg-transparent text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                  onClick={onShare}
                  disabled={isSharing}
                >
                  {isSharing ? 'Sharing…' : 'Share'}
                </Button>
              </div>

              {/* License & source links */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--ussy-text-faint)]">
                <p>
                  This live app includes AGPL-licensed Strudel components. Corresponding source is
                  available in the public repository.
                </p>
                <div className="flex items-center gap-3">
                  <a
                    href={SOURCE_REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--ussy-text-muted)] underline decoration-[var(--ussy-divider)] underline-offset-2 transition hover:text-[var(--ussy-text)]"
                  >
                    Source
                  </a>
                  <a
                    href={LICENSE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--ussy-text-muted)] underline decoration-[var(--ussy-divider)] underline-offset-2 transition hover:text-[var(--ussy-text)]"
                  >
                    License
                  </a>
                  <a
                    href={DISCLOSURE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--ussy-text-muted)] underline decoration-[var(--ussy-divider)] underline-offset-2 transition hover:text-[var(--ussy-text)]"
                  >
                    Prompt Docs Note
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default ProjectTopbar
