/**
 * // What changed:
 * // - Added Chat/Learn tab switching and tutorial panel rendering
 * // - Added AI response deep-links into matching interactive tutorial lessons
 * // - Preserved existing chat message rendering, diff actions, and composer behavior
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ChevronLeft, SendHorizonal, Trash2, User2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import DiffPreviewCard from '@/components/DiffPreviewCard'
import { FUNCTION_LESSON_MAP, TutorialPanel, type LessonId } from '@/features/tutorial'
import type { CodeDiff, ChatMessage } from '@/types/project'

interface ChatPanelProps {
  messages: ChatMessage[]
  isSending: boolean
  statusText?: string | null
  errorText?: string | null
  yoloMode?: boolean
  onSend: (content: string) => Promise<void>
  onRetryLast?: () => void
  onToggleYolo?: () => void
  onApplyDiff: (messageId: string, diff: CodeDiff) => void
  onRejectDiff: (messageId: string, diff: CodeDiff) => void
  onPreviewDiff: (messageId: string, diff: CodeDiff) => void
  onStopPreview: (messageId: string, diff: CodeDiff) => void
  onCollapse?: () => void
  onClear?: () => void
  tutorial: React.ComponentProps<typeof TutorialPanel>
  activeTab: 'chat' | 'learn'
  onActiveTabChange: (tab: 'chat' | 'learn') => void
  incompleteCount: number
  openTutorial: (lessonId?: LessonId) => void
}

const ChatPanel = ({
  messages,
  isSending,
  statusText,
  errorText,
  yoloMode = false,
  onSend,
  onRetryLast,
  onToggleYolo,
  onApplyDiff,
  onRejectDiff,
  onPreviewDiff,
  onStopPreview,
  onCollapse,
  onClear,
  tutorial,
  activeTab,
  onActiveTabChange,
  incompleteCount,
  openTutorial,
}: ChatPanelProps) => {
  const [value, setValue] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const promptChips = [
    'Add a hard-hitting B section',
    'Make this darker and more danceable',
    'Fix any Strudel errors',
    'Turn this into 140 BPM techno',
  ]

  useEffect(() => {
    const container = threadRef.current
    if (!container || activeTab !== 'chat') return
    // Only auto-scroll when the user is already near the bottom, so reading
    // earlier messages is not interrupted by incoming chunks.
    if (stickToBottomRef.current) {
      container.scrollTop = container.scrollHeight
    }
  }, [activeTab, messages, isSending])

  const handleThreadScroll = () => {
    const container = threadRef.current
    if (!container) return
    stickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 80
  }

  const canSend = useMemo(() => value.trim().length > 0, [value])

  const handleSubmit = async () => {
    const nextValue = value.trim()
    if (!nextValue) return
    setValue('')
    await onSend(nextValue)
  }

  const handlePromptChip = async (prompt: string) => {
    setValue('')
    await onSend(prompt)
  }

  const messageCount = messages.length

  const getLessonMatch = (message: ChatMessage): { lessonId: LessonId; functionName: string } | null => {
    if (message.role !== 'assistant') return null
    const matchedFunction = Object.keys(FUNCTION_LESSON_MAP).find((key) => message.content.includes(key))
    if (!matchedFunction) return null
    return {
      lessonId: FUNCTION_LESSON_MAP[matchedFunction] as LessonId,
      functionName: matchedFunction,
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface)]">
      <div className="border-b border-[var(--ussy-divider)]" role="tablist" aria-label="Chat and tutorial tabs">
        {activeTab === 'chat' ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <p className="flex-1 text-sm font-semibold text-[var(--ussy-text)]">Session Chat</p>
            <span className="rounded-full bg-[var(--ussy-surface-2)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--ussy-text-muted)]">
              {messageCount} msg{messageCount !== 1 ? 's' : ''}
            </span>
            {onClear ? (
              <button
                onClick={onClear}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--ussy-text-faint)] transition hover:bg-[var(--ussy-surface-2)] hover:text-[var(--ussy-text)]"
                aria-label="Clear chat history"
                title="Clear chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onCollapse ? (
              <button
                onClick={onCollapse}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--ussy-text-faint)] transition hover:bg-[var(--ussy-surface-2)] hover:text-[var(--ussy-text)]"
                aria-label="Collapse chat panel"
                title="Collapse"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex border-t border-[var(--ussy-divider)] px-1">
          <button
            role="tab"
            aria-selected={activeTab === 'chat'}
            aria-controls="chat-panel-tab"
            className={`px-4 py-2 text-xs font-medium ${
              activeTab === 'chat'
                ? 'border-b-2 border-[var(--ussy-accent)] text-[var(--ussy-text)]'
                : 'text-[var(--ussy-text-muted)] hover:text-[var(--ussy-text)]'
            }`}
            onClick={() => onActiveTabChange('chat')}
          >
            Chat
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'learn'}
            aria-controls="learn-panel-tab"
            className={`relative px-4 py-2 text-xs font-medium ${
              activeTab === 'learn'
                ? 'border-b-2 border-[var(--ussy-accent)] text-[var(--ussy-text)]'
                : 'text-[var(--ussy-text-muted)] hover:text-[var(--ussy-text)]'
            }`}
            onClick={() => onActiveTabChange('learn')}
          >
            Learn
            {incompleteCount > 0 ? (
              <span className="absolute -right-8 top-1/2 -translate-y-1/2 rounded-full bg-[var(--ussy-accent)] px-1.5 py-0.5 text-[8px] text-[var(--ussy-bg)]">
                {incompleteCount}/40
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {activeTab === 'learn' ? (
        <div id="learn-panel-tab" className="min-h-0 flex-1 overflow-hidden">
          <TutorialPanel {...tutorial} />
        </div>
      ) : (
        <>
          <div id="chat-panel-tab" ref={threadRef} onScroll={handleThreadScroll} className="flex-1 space-y-4 overflow-auto px-3 py-3 sm:px-4 sm:py-4">
            {messages.map((message) => {
              const lessonMatch = getLessonMatch(message)

              return (
                <div key={message.id} className="space-y-3">
                  <div className="flex gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] text-[var(--ussy-text-muted)]">
                      {message.role === 'user' ? <User2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--ussy-text-muted)]">
                        <span>{message.role}</span>
                        <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-4 py-3 text-sm text-[var(--ussy-text)]">
                        {message.role === 'assistant' &&
                        !message.status &&
                        !message.code_diff &&
                        /^\s*(?:```[a-z]*\s*)?\{/.test(message.content)
                          ? '\u2726 Composing...'
                          : message.content}
                      </div>
                      {lessonMatch ? (
                        <button
                          type="button"
                          className="mt-2 text-xs text-[var(--ussy-accent)] hover:underline"
                          onClick={() => openTutorial(lessonMatch.lessonId)}
                        >
                          → Learn {lessonMatch.functionName} interactively (Lesson {lessonMatch.lessonId})
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {message.code_diff ? (
                    <div className="pl-11">
                      <DiffPreviewCard
                        messageId={message.id}
                        diff={message.code_diff}
                        status={message.status}
                        isPreviewing={message.isPreviewing}
                        onApply={onApplyDiff}
                        onReject={onRejectDiff}
                        onPreview={onPreviewDiff}
                        onStopPreview={onStopPreview}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}

            {isSending ? (
              <div className="flex gap-3 pl-1 text-sm text-[var(--ussy-text-muted)]">
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)]">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-4 py-3">
                  Streaming response...
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[var(--ussy-divider)] p-3 sm:p-4">
            {errorText ? (
              <div className="mb-3 rounded-xl border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                {errorText}
              </div>
            ) : null}

            {statusText && !errorText ? (
              <div className="mb-3 rounded-xl border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-3 py-2 text-xs text-[var(--ussy-text-muted)]">
                {statusText}
              </div>
            ) : null}

            <div className="mb-3 flex flex-wrap gap-2">
              {promptChips.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-full border border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] px-3 py-1.5 text-left text-xs text-[var(--ussy-text-muted)] transition hover:border-[var(--ussy-accent)] hover:text-[var(--ussy-text)] disabled:opacity-50"
                  disabled={isSending}
                  onClick={() => void handlePromptChip(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <Textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void handleSubmit()
                }
              }}
              placeholder="Describe a change, ask for a section, or request a fix..."
              className="min-h-[84px] resize-none border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] text-[var(--ussy-text)] placeholder:text-[var(--ussy-text-faint)] focus-visible:ring-[var(--ussy-accent)] sm:min-h-[104px]"
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <p className="text-xs text-[var(--ussy-text-muted)]">Cmd/Ctrl+Enter sends. AI changes stay in review until you apply them.</p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-[var(--ussy-divider)] bg-transparent px-2 text-xs text-[var(--ussy-text)] hover:bg-[var(--ussy-surface-2)]"
                    onClick={() => void onRetryLast?.()}
                  >
                    Retry last
                  </Button>
                  <label className="flex items-center gap-2 text-xs text-[var(--ussy-text-muted)]">
                    <input
                      type="checkbox"
                      checked={yoloMode}
                      onChange={() => onToggleYolo?.()}
                      className="h-4 w-4 rounded border-[var(--ussy-divider)] bg-[var(--ussy-surface-2)] text-[var(--ussy-accent)] focus:ring-[var(--ussy-accent)]"
                    />
                    <span>YOLO: auto-apply patches</span>
                  </label>
                </div>
              </div>
              <Button
                className="gap-2 bg-[var(--ussy-accent)] text-[var(--ussy-bg)] hover:bg-[var(--ussy-accent-bright)]"
                onClick={() => void handleSubmit()}
                disabled={!canSend || isSending}
              >
                <SendHorizonal className="h-4 w-4" />
                {isSending ? 'Sending...' : 'Send'}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

export default ChatPanel
