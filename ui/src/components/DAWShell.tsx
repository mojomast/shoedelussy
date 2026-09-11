/* ============================================================================
   DAWShell.tsx — Refactored layout shell (Ussy Mode)

   // What changed (Sprint 2):
   // - BUG FIX: Resize handles converted from mouse to pointer events with
   //   setPointerCapture for tablet/trackpad support
   // - BUG FIX: Panel widths & collapse states persisted to localStorage
   //   (widths debounced 300ms, collapse states immediate)
   // - BUG FIX: VersionHistoryPanel rendering removed from DAW sidebar —
   //   DawPanel accordion now owns it via its own versionPanel prop
   // - UX: ChatPanel collapse button moved into ChatPanel header via
   //   React.cloneElement; absolute overlay collapse button removed
   // - UX: isDragging state adds select-none during resize drag
   // - UX: Focus mode collapses grid gutter columns to 0px
   // - UX: Icon rail tooltips added via title attributes
   // - A11Y: Resize handles retain ARIA separator role + keyboard attributes
   ============================================================================ */

import {
  type ReactNode,
  useState,
  useCallback,
  useRef,
  useEffect,
  isValidElement,
  cloneElement,
} from 'react'
import { ChevronLeft, ChevronRight, MessageSquare, Sliders, Maximize2, Minimize2 } from 'lucide-react'
import VersionHistoryPanel from '@/components/VersionHistoryPanel'

interface DAWShellProps {
  topbar: ReactNode
  chatPanel: ReactNode
  editorPanel: ReactNode
  vizPanel: ReactNode | null
  showVisualization?: boolean
  dawPanel: ReactNode
  transportBar: ReactNode
  versionPanel: React.ComponentProps<typeof VersionHistoryPanel>
  overlay?: ReactNode
}

const CHAT_MIN = 260
const CHAT_DEFAULT = 320
const CHAT_MAX = 500
const DAW_MIN = 280
const DAW_DEFAULT = 380
const DAW_MAX = 520
const COLLAPSED_WIDTH = 40

// localStorage keys
const LS_CHAT_WIDTH = 'shoedelussy:chatWidth'
const LEGACY_LS_CHAT_WIDTH = 'strudelussy:chatWidth'
const LS_DAW_WIDTH = 'shoedelussy:dawWidth'
const LEGACY_LS_DAW_WIDTH = 'strudelussy:dawWidth'
const LS_CHAT_COLLAPSED = 'shoedelussy:chatCollapsed'
const LEGACY_LS_CHAT_COLLAPSED = 'strudelussy:chatCollapsed'
const LS_DAW_COLLAPSED = 'shoedelussy:dawCollapsed'
const LEGACY_LS_DAW_COLLAPSED = 'strudelussy:dawCollapsed'

function readNumber(key: string, fallback: number, min: number, max: number, legacyKey?: string): number {
  try {
    const raw = localStorage.getItem(key) ?? (legacyKey ? localStorage.getItem(legacyKey) : null)
    if (raw !== null) {
      if (legacyKey && localStorage.getItem(key) === null) {
        localStorage.setItem(key, raw)
      }
      const n = Number(raw)
      if (Number.isFinite(n)) return Math.min(max, Math.max(min, n))
    }
  } catch { /* storage unavailable */ }
  return fallback
}

function readBool(key: string, fallback: boolean, legacyKey?: string): boolean {
  try {
    const raw = localStorage.getItem(key) ?? (legacyKey ? localStorage.getItem(legacyKey) : null)
    if (raw !== null && legacyKey && localStorage.getItem(key) === null) {
      localStorage.setItem(key, raw)
    }
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch { /* storage unavailable */ }
  return fallback
}

const DAWShell = ({
  topbar,
  chatPanel,
  editorPanel,
  vizPanel,
  showVisualization = true,
  dawPanel,
  transportBar,
  versionPanel: _versionPanel,
  overlay,
}: DAWShellProps) => {
  const [chatWidth, setChatWidth] = useState(() => readNumber(LS_CHAT_WIDTH, CHAT_DEFAULT, CHAT_MIN, CHAT_MAX, LEGACY_LS_CHAT_WIDTH))
  const [dawWidth, setDawWidth] = useState(() => readNumber(LS_DAW_WIDTH, DAW_DEFAULT, DAW_MIN, DAW_MAX, LEGACY_LS_DAW_WIDTH))
  const [chatCollapsed, setChatCollapsed] = useState(() => readBool(LS_CHAT_COLLAPSED, false, LEGACY_LS_CHAT_COLLAPSED))
  const [dawCollapsed, setDawCollapsed] = useState(() => readBool(LS_DAW_COLLAPSED, false, LEGACY_LS_DAW_COLLAPSED))
  const [focusMode, setFocusMode] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced localStorage persistence for widths
  useEffect(() => {
    if (widthTimerRef.current) clearTimeout(widthTimerRef.current)
    widthTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(LS_CHAT_WIDTH, String(chatWidth))
        localStorage.setItem(LS_DAW_WIDTH, String(dawWidth))
      } catch { /* ignore */ }
    }, 300)
    return () => {
      if (widthTimerRef.current) clearTimeout(widthTimerRef.current)
    }
  }, [chatWidth, dawWidth])

  // Immediate localStorage persistence for collapse states
  useEffect(() => {
    try {
      localStorage.setItem(LS_CHAT_COLLAPSED, String(chatCollapsed))
      localStorage.setItem(LS_DAW_COLLAPSED, String(dawCollapsed))
    } catch { /* ignore */ }
  }, [chatCollapsed, dawCollapsed])

  // Resize handler for chat panel (right edge) — pointer events
  const handleChatResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = chatWidth

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.min(CHAT_MAX, Math.max(CHAT_MIN, startWidth + delta))
      setChatWidth(newWidth)
    }

    const onUp = () => {
      setIsDragging(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [chatWidth])

  // Keyboard resizing for the chat handle (ARIA separator contract)
  const handleChatResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10
    let next = chatWidth
    if (e.key === 'ArrowLeft') next -= step
    else if (e.key === 'ArrowRight') next += step
    else if (e.key === 'Home') next = CHAT_MIN
    else if (e.key === 'End') next = CHAT_MAX
    else return
    e.preventDefault()
    setChatWidth(Math.min(CHAT_MAX, Math.max(CHAT_MIN, next)))
  }, [chatWidth])

  // Resize handler for daw panel (left edge) — pointer events
  const handleDawResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = dawWidth

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX
      const newWidth = Math.min(DAW_MAX, Math.max(DAW_MIN, startWidth + delta))
      setDawWidth(newWidth)
    }

    const onUp = () => {
      setIsDragging(false)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [dawWidth])

  // Keyboard resizing for the DAW handle (grows leftward)
  const handleDawResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10
    let next = dawWidth
    if (e.key === 'ArrowLeft') next += step
    else if (e.key === 'ArrowRight') next -= step
    else if (e.key === 'Home') next = DAW_MIN
    else if (e.key === 'End') next = DAW_MAX
    else return
    e.preventDefault()
    setDawWidth(Math.min(DAW_MAX, Math.max(DAW_MIN, next)))
  }, [dawWidth])

  // Keyboard shortcuts
  useEffect(() => {
    const isEditableTarget = (e: KeyboardEvent): boolean => {
      const target = e.target
      if (!(target instanceof HTMLElement)) return false
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') !== null
      )
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setFocusMode((f) => !f)
      }
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false)
      }
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !isEditableTarget(e)) {
        setChatCollapsed((c) => !c)
      }
      if (e.key === ']' && !e.metaKey && !e.ctrlKey && !isEditableTarget(e)) {
        setDawCollapsed((c) => !c)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode])

  const effectiveChatWidth = focusMode ? 0 : chatCollapsed ? COLLAPSED_WIDTH : chatWidth
  const effectiveDawWidth = focusMode ? 0 : dawCollapsed ? COLLAPSED_WIDTH : dawWidth
  const gutterWidth = focusMode ? 0 : 6

  // Inject onCollapse into chatPanel via cloneElement
  const chatPanelWithCollapse = isValidElement<{ onCollapse?: () => void }>(chatPanel)
    ? cloneElement(chatPanel, { onCollapse: () => setChatCollapsed(true) })
    : chatPanel

  return (
    <>
      <main
        ref={containerRef}
        className={`h-screen overflow-hidden px-2 py-2 text-white sm:px-3 sm:py-3 ${focusMode ? 'focus-mode' : ''} ${isDragging ? 'select-none' : ''}`}
        style={{ backgroundColor: 'var(--ussy-bg)' }}
      >
        <div className="flex h-full min-h-0 flex-col gap-1.5">

          {/* Topbar — hidden in focus mode */}
          {!focusMode && (
            <div className="ussy-topbar shrink-0">
              {topbar}
            </div>
          )}

          {/* Main 3-column grid */}
          <div
            className="ussy-panel-transition grid min-h-0 flex-1 gap-0 overflow-hidden"
            style={{
              gridTemplateColumns: `${effectiveChatWidth}px ${gutterWidth}px 1fr ${gutterWidth}px ${effectiveDawWidth}px`,
            }}
          >

            {/* LEFT: Chat Panel or collapsed icon rail */}
            {!focusMode && (
              <>
                <div className="ussy-sidebar-left relative min-h-0 overflow-hidden">
                  {chatCollapsed ? (
                    <div className="ussy-icon-rail h-full rounded-xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface)]">
                      <button
                        onClick={() => setChatCollapsed(false)}
                        className="ussy-hover-transition flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ussy-text-muted)] hover:bg-[var(--ussy-surface-2)] hover:text-[var(--ussy-text)]"
                        aria-label="Expand chat panel"
                        title="Session Chat"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <div
                        className="flex h-8 w-8 items-center justify-center text-[var(--ussy-text-faint)]"
                        title="Session Chat"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex h-full min-h-0 flex-col">
                      {chatPanelWithCollapse}
                    </div>
                  )}
                </div>

                {/* Chat resize handle */}
                <div
                  className="ussy-resize-handle"
                  onPointerDown={chatCollapsed ? undefined : handleChatResizeStart}
                  onKeyDown={chatCollapsed ? undefined : handleChatResizeKeyDown}
                  role="separator"
                  tabIndex={chatCollapsed ? -1 : 0}
                  aria-orientation="vertical"
                  aria-valuenow={chatWidth}
                  aria-valuemin={CHAT_MIN}
                  aria-valuemax={CHAT_MAX}
                  aria-label="Resize chat panel"
                  title="Drag or use arrow keys to resize"
                />
              </>
            )}
            {focusMode && (
              <>
                <div />
                <div />
              </>
            )}

            {/* CENTER: Editor + Viz + Transport */}
            <section className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
              <div className="min-h-0 flex-1 overflow-hidden">
                {editorPanel}
              </div>

              {showVisualization && vizPanel ? (
                <div className="h-48 shrink-0 overflow-hidden rounded-xl border border-[var(--ussy-divider)] bg-black/40">
                  {vizPanel}
                </div>
              ) : null}

              <div className="shrink-0">
                {transportBar}
              </div>
            </section>

            {/* DAW resize handle */}
            {!focusMode && (
              <>
                <div
                  className="ussy-resize-handle"
                  onPointerDown={dawCollapsed ? undefined : handleDawResizeStart}
                  onKeyDown={dawCollapsed ? undefined : handleDawResizeKeyDown}
                  role="separator"
                  tabIndex={dawCollapsed ? -1 : 0}
                  aria-orientation="vertical"
                  aria-valuenow={dawWidth}
                  aria-valuemin={DAW_MIN}
                  aria-valuemax={DAW_MAX}
                  aria-label="Resize DAW panel"
                  title="Drag or use arrow keys to resize"
                />

                {/* RIGHT: DAW Panel or collapsed icon rail */}
                <aside className="ussy-sidebar-right min-h-0 overflow-hidden">
                  {dawCollapsed ? (
                    <div className="ussy-icon-rail h-full rounded-xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface)]">
                      <button
                        onClick={() => setDawCollapsed(false)}
                        className="ussy-hover-transition flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ussy-text-muted)] hover:bg-[var(--ussy-surface-2)] hover:text-[var(--ussy-text)]"
                        aria-label="Expand DAW panel"
                        title="DAW Controls"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div
                        className="flex h-8 w-8 items-center justify-center text-[var(--ussy-text-faint)]"
                        title="DAW Controls"
                      >
                        <Sliders className="h-4 w-4" />
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface)]">
                      <button
                        onClick={() => setDawCollapsed(true)}
                        className="ussy-hover-transition absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-md text-[var(--ussy-text-faint)] hover:bg-[var(--ussy-surface-2)] hover:text-[var(--ussy-text)]"
                        aria-label="Collapse DAW panel"
                        title="Collapse DAW panel"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
                        {dawPanel}
                      </div>
                    </div>
                  )}
                </aside>
              </>
            )}
            {focusMode && (
              <>
                <div />
                <div />
              </>
            )}
          </div>

          {/* Focus mode toggle — always visible as floating button */}
          <button
            onClick={() => setFocusMode((f) => !f)}
            className="ussy-hover-transition fixed bottom-14 right-4 z-50 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] text-[var(--ussy-text-muted)] shadow-lg hover:bg-[var(--ussy-surface-3)] hover:text-[var(--ussy-text)]"
            aria-label="Toggle focus mode"
            title={focusMode ? 'Exit focus mode (Cmd+Shift+F)' : 'Enter focus mode (Cmd+Shift+F)'}
          >
            {focusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </main>
      {overlay}
    </>
  )
}

export default DAWShell
