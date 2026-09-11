import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectStore, trimChatHistoryForApi } from '@/stores/projectStore'
import { api } from '@/lib/api'
import { buildCodeDiff } from '@/lib/diffUtils'
import { getLastProjectId, getOrCreateGuestUserId, loadChatProviderConfig, loadLocalProject, loadPromptPresets, saveChatProviderConfig, saveLocalProject, upsertPromptPreset } from '@/lib/projectStorage'
import {
  addJuxRevToRandomMelodicTrack,
  addRandomReverbToTracks,
  addVariationToRandomTrack,
  mutateDrumTracks,
  parseBpmFromCode,
  parseKeyFromCode,
  parseTracks,
  normalizeNamedTrackSyntax,
  updateDetectedParamInCode,
  upsertSetcpsFromBpm,
} from '@/lib/codeParser'
import type { TrackGain } from '@/lib/codeParser'
import { createId } from '@/lib/utils'
import { DEFAULT_CHAT_MODEL, DEFAULT_SYSTEM_PROMPT_MODE } from '@/types/project'
import type { ChatMessage, ChatStreamErrorInfo, CodeDiff, CodeVersion, ExtractedParam, LightingProjectState, Project, SavedPromptPreset, SectionMarker, SystemPromptMode } from '@/types/project'
import type { CycleInfo } from '@/components/StrudelEditor'
import type { EditorBridge } from '@/components/EditorPanel'

const normalizeProviderEndpoint = (endpoint: string) => endpoint.trim().replace(/\/+$/g, '')

const normalizeProjectCode = (project: Project): Project => {
  const strudelCode = normalizeNamedTrackSyntax(project.strudel_code)
  return strudelCode === project.strudel_code ? project : { ...project, strudel_code: strudelCode }
}

const formatProviderConfig = (endpoint: string, apiKey: string) => {
  const normalizedEndpoint = normalizeProviderEndpoint(endpoint)
  const trimmedApiKey = apiKey.trim()
  return normalizedEndpoint && trimmedApiKey
    ? { endpoint: normalizedEndpoint, apiKey: trimmedApiKey }
    : null
}

const DEFAULT_CUSTOM_PROMPT_TEMPLATE = `You are an expert Strudel live coding music assistant. Use the core documentation below to help users create and modify musical patterns.

Rules:
- Return one valid JSON object only.
- If code changes, return the full updated Strudel code.
- Keep existing structure unless the user explicitly asks for a rewrite.
- If the request is impossible in supported Strudel, explain that and set has_code_change to false.`

const IMPROVED_CUSTOM_PROMPT_TEMPLATE = `You are an expert Strudel live coding assistant.
Your ONLY job is to help the user create and refine music using Strudel's pattern API and mini-notation.

Strict contract:
- Output ONLY one valid JSON object.
- Always include message, code, diff_summary, and has_code_change.
- When no code change is needed, set code and diff_summary to empty strings.
- When a code change is needed, code must contain the FULL updated Strudel code.

Critical rules:
- Only use constructs already present in the current code, explicitly listed in the system prompt, or documented in the Strudel reference.
- Never invent unsupported methods, sounds, banks, or track forms.
- Prefer small incremental edits unless the user explicitly asks for a rewrite.
- If the request cannot be completed safely in supported Strudel, explain the limitation and choose the closest safe alternative or return has_code_change false.

Strudel-specific rules:
- For "occasional" or "rare" one-shot events, prefer explicit mini-notation choices using ~ for silence, e.g.:
  s("sample | ~ | ~ | ~")
- Use degradeBy(p) ONLY to drop events in patterns that already have repeated events; it removes events with probability p.
- Do NOT use sometimesBy(p, x => x) as a way to mute; x => x is a no-op. If you need to mute, apply a transform that actually silences, such as masking or explicit ~.
- If you’re unsure, FALL BACK to the explicit pattern form with ~ for silence, rather than guessing degradeBy/sometimesBy semantics.

Decision ladder:
1. Make the smallest safe change that satisfies the request.
2. If only part is possible, make the closest safe substitution and explain it.
3. If advice is better than code, return has_code_change false.`

const EMPTY_RESPONSE_PATTERNS = [
  'empty response',
  'streaming chat ended before final response was received',
  'streaming chat ended without a final structured response',
  'llm returned an empty response',
  'invalid response',
]

const RATE_LIMIT_PATTERN = /rate limit/i
const HIGH_DEMAND_PATTERN = /high demand|try again shortly/i

const getFriendlyChatError = (error: ChatStreamErrorInfo | Error | unknown) => {
  const message = error instanceof Error ? error.message : (error as ChatStreamErrorInfo | undefined)?.message || 'Something went wrong. Please try again.'
  const lowerMessage = message.toLowerCase()

  if (RATE_LIMIT_PATTERN.test(message)) {
    const retryAfter = (error as ChatStreamErrorInfo | { retryAfter?: number } | undefined)?.retryAfter
    return retryAfter
      ? `Rate limit reached. Wait about ${retryAfter} seconds, then try again.`
      : 'Rate limit reached. Wait a moment, then try again.'
  }

  if (HIGH_DEMAND_PATTERN.test(lowerMessage)) {
    return 'The AI service is under heavy load right now. Retry in a moment.'
  }

  if (lowerMessage.includes('malformed streaming event')) {
    return 'The stream glitched before the final patch arrived. Retry the prompt once.'
  }

  return message
}

const estimateTokens = (text: string) => Math.ceil(text.length / 4)

const getModelMessageCap = (model: string) => {
  const normalized = model.toLowerCase()
  if (normalized.includes('gpt-5') || normalized.includes('3.1') || normalized.includes('2.5')) {
    return 16
  }
  return 12
}

const summarizeMessages = (messages: ChatMessage[]) => {
  if (messages.length === 0) return null
  const summary = messages
    .map((message) => `${message.role}: ${message.content.replace(/\s+/g, ' ').trim().slice(0, 140)}`)
    .join(' | ')
  return `Conversation so far: ${summary}`
}

const isRetryableEmptyResponseError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return EMPTY_RESPONSE_PATTERNS.some((pattern) => message.includes(pattern))
}

const isAbortError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError'

const DEFAULT_CODE = `setcps(0.56)

// [intro]
chords$: note("<c2 eb2 g2 bb2>")
  .s("sawtooth")
  .slow(2)
  .room(0.25)
  .gain(0.62)
  .color("purple")

floor$: s("hh*4")
  .gain(0.28)
  .color("cyan")

// [drop]
kick$: s("bd*4")
  .gain(0.95)
  .room(0.08)
  .color("white")

snare$: s("~ sd ~ sd")
  .gain(0.72)
  .room(0.12)
  .color("orange")

lead$: note("<c4 eb4 g4 bb4 c5 bb4 g4 eb4>")
  .s("gm_epiano1")
  .gain(0.58)
  .delay(0.25)
  .color("magenta")

// [breakdown]
beam$: note("<c3 ~ g3 bb3>")
  .s("sawtooth")
  .slow(2)
  .gain(0.5)
  .lpf(900)
  .color("blue")`

const DEMO_LIGHTING: LightingProjectState = {
  cue_bindings: [
    { section_label: 'intro', scene_id: 'front_warm' },
    { section_label: 'drop', scene_id: 'club_purple' },
    { section_label: 'breakdown', scene_id: 'back_blue' },
  ],
  group_bindings: [
    { track_name: 'kick', group_id: 'strobes', intensity: 255, hold_ms: 90, fade_ms: 20 },
    { track_name: 'snare', group_id: 'front_wash', intensity: 230, hold_ms: 130, fade_ms: 35 },
    { track_name: 'floor', group_id: 'floor', intensity: 180, hold_ms: 80, fade_ms: 30 },
    { track_name: 'lead', group_id: 'all_wash', intensity: 170, hold_ms: 160, fade_ms: 60 },
    { track_name: 'beam', group_id: 'back_beams', intensity: 220, hold_ms: 260, fade_ms: 80 },
  ],
}

const EMPTY_CODE = `setcps(0.5)

// [idea]
$: s("bd ~ sd ~")
  .gain(0.8)`

const downloadFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const createProjectTemplate = (userId: string, template: 'empty' | 'demo' = 'demo'): Project => {
  const strudelCode = template === 'demo' ? DEFAULT_CODE : EMPTY_CODE
  const now = new Date().toISOString()
  return {
    id: createId(),
    user_id: userId,
    name: template === 'demo' ? 'Demo Shoedelussy Session' : 'Untitled Project',
    strudel_code: strudelCode,
    chat_history: [
      {
        id: createId(),
        role: 'system',
        content:
          template === 'demo'
            ? 'Demo project loaded. Ask the AI to evolve the groove, add sections, or fix code before it reaches the editor.'
            : 'Blank project initialized. Start from scratch or ask the AI to scaffold a groove.',
        timestamp: now,
      },
    ],
    versions: [],
    lighting: template === 'demo' ? DEMO_LIGHTING : { cue_bindings: [], group_bindings: [] },
    bpm: parseBpmFromCode(strudelCode),
    key: parseKeyFromCode(strudelCode),
    tags: template === 'demo' ? ['guest', 'demo'] : ['guest', 'empty'],
    created_at: now,
    updated_at: now,
  }
}

interface UseChatOrchestratorArgs {
  searchParams: URLSearchParams
  setSearchParams: (nextInit: URLSearchParams | Record<string, string>) => void
  routeShareId?: string
}

export const useChatOrchestrator = ({ searchParams, setSearchParams, routeShareId }: UseChatOrchestratorArgs) => {
  const [isSending, setIsSending] = useState(false)
  const [masterVolume, setMasterVolume] = useState(0.85)
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null)
  const [customApiEndpoint, setCustomApiEndpoint] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState(DEFAULT_CUSTOM_PROMPT_TEMPLATE)
  const [savedPromptPresets, setSavedPromptPresets] = useState<SavedPromptPreset[]>([])
  const [promptPresetName, setPromptPresetName] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([DEFAULT_CHAT_MODEL])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [yoloMode, setYoloMode] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [remixNotice, setRemixNotice] = useState<string | null>(null)
  const [lastSharedAt, setLastSharedAt] = useState<string | null>(null)
  const [chatSummary, setChatSummary] = useState<string | null>(null)
  const [approxTokenUsage, setApproxTokenUsage] = useState(0)
  const [chatStatus, setChatStatus] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null)
  const [isEditorInitialized, setIsEditorInitialized] = useState(false)
  const [isEditorInitializing, setIsEditorInitializing] = useState(false)
  const [isLoadingProject, setIsLoadingProject] = useState(true)
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [isRestoringVersion, setIsRestoringVersion] = useState(false)
  const [versionError, setVersionError] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [isRhythmGeneratorCollapsed, setIsRhythmGeneratorCollapsed] = useState(true)
  const [isArrangePanelCollapsed, setIsArrangePanelCollapsed] = useState(true)
  const [isFxRackCollapsed, setIsFxRackCollapsed] = useState(true)
  const pendingSendContentsRef = useRef(new Set<string>())
  const activeChatAbortRef = useRef<AbortController | null>(null)
  const loadedShareIdRef = useRef<string | null>(null)
  const lastStreamUpdateRef = useRef(0)
  const bufferedStreamContentRef = useRef('')
  const flushStreamFrameRef = useRef<number | null>(null)

  const editorBridgeRef = useRef<Partial<EditorBridge>>({})
  const masterVolumeRef = useRef(0.85)
  const autoSaveTimerRef = useRef<number | null>(null)
  const paramEvaluateTimerRef = useRef<number | null>(null)
  const typingEvaluateTimerRef = useRef<number | null>(null)
  const previewSnapshotRef = useRef<string | null>(null)
  const previewMessageIdRef = useRef<string | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)

  const {
    currentProject,
    chatMessages,
    pendingDiffs,
    sections,
    activeSection,
    isDirty,
    isSaving,
    saveError,
    isPlaying,
    strudelError,
    params,
    selectedModel,
    systemPromptMode,
    actions,
  } = useProjectStore()

  const userId = getOrCreateGuestUserId()
  const navigate = useNavigate()
  const activeProviderRef = useRef<ReturnType<typeof formatProviderConfig>>(null)
  const customProvider = activeProviderRef.current

  useEffect(() => {
    const savedConfig = loadChatProviderConfig()
    setSavedPromptPresets(loadPromptPresets())
    if (!savedConfig) return

    setCustomApiEndpoint(savedConfig.endpoint)
    setCustomApiKey(savedConfig.apiKey)
    setCustomSystemPrompt(savedConfig.customSystemPrompt || DEFAULT_CUSTOM_PROMPT_TEMPLATE)
    activeProviderRef.current = formatProviderConfig(savedConfig.endpoint, savedConfig.apiKey)
    setAvailableModels(savedConfig.selectedModel ? [savedConfig.selectedModel] : [DEFAULT_CHAT_MODEL])
    actions.setSelectedModel(savedConfig.selectedModel || DEFAULT_CHAT_MODEL)
    actions.setSystemPromptMode(savedConfig.systemPromptMode || DEFAULT_SYSTEM_PROMPT_MODE)
  }, [actions])

  useEffect(() => {
    if (!customApiEndpoint && !customApiKey) {
      activeProviderRef.current = null
      setAvailableModels([DEFAULT_CHAT_MODEL])
      setModelLoadError(null)
      actions.setSelectedModel(DEFAULT_CHAT_MODEL)
      saveChatProviderConfig(null)
    } else if (activeProviderRef.current) {
      const currentConfig = formatProviderConfig(customApiEndpoint, customApiKey)
      const isStale = !currentConfig
        || currentConfig.endpoint !== activeProviderRef.current.endpoint
        || currentConfig.apiKey !== activeProviderRef.current.apiKey

      if (isStale) {
        activeProviderRef.current = null
        setAvailableModels([DEFAULT_CHAT_MODEL])
        setModelLoadError('Provider settings changed. Click Load Models to refresh the model list.')
        actions.setSelectedModel(DEFAULT_CHAT_MODEL)
      }
    }
  }, [actions, customApiEndpoint, customApiKey])

  const registerEditor = useCallback((bridge: Partial<EditorBridge>) => {
    editorBridgeRef.current = { ...editorBridgeRef.current, ...bridge }
    if (bridge.setMasterVolume) {
      bridge.setMasterVolume(masterVolumeRef.current)
    }
    const currentCode = useProjectStore.getState().currentProject?.strudel_code
    if (bridge.setCode && currentCode) {
      bridge.setCode(currentCode)
    }
  }, [])

  const getCurrentCode = useCallback(() => editorBridgeRef.current.getCode?.() ?? currentProject?.strudel_code ?? '', [currentProject?.strudel_code])

  const loadVersions = useCallback(async (projectId: string) => {
    setIsLoadingVersions(true)
    setVersionError(null)
    try {
      const versions = await api.getVersions(projectId, userId)
      actions.replaceVersions(versions)
    } catch (error) {
      if (error instanceof Error && error.message.includes('Project not found')) {
        actions.replaceVersions([])
      } else {
        setVersionError(error instanceof Error ? error.message : 'Failed to load version history.')
      }
    } finally {
      setIsLoadingVersions(false)
    }
  }, [actions, userId])

  const persistProject = useCallback(async (project: Project): Promise<Project> => {
    actions.setSaving(true)
    actions.setSaveError(null)

    const payload: Project = {
      ...project,
      chat_history: useProjectStore.getState().chatMessages,
      versions: useProjectStore.getState().currentProject?.versions ?? project.versions,
      updated_at: new Date().toISOString(),
    }

    saveLocalProject(payload)

    try {
      const existsRemotely = project.id === searchParams.get('project')
      const savedProject = existsRemotely
        ? await api.updateProject(payload, userId)
        : await api.createProject(payload, userId)
      saveLocalProject(savedProject)
      actions.setProject(savedProject)
      actions.markSaved(savedProject.updated_at)
      setSearchParams({ project: savedProject.id })
      return savedProject
    } catch (error) {
      actions.setSaveError(error instanceof Error ? error.message : 'Unable to save project to API. Local guest copy kept.')
      actions.markSaved(payload.updated_at)
      return payload
    }
  }, [actions, searchParams, setSearchParams, userId])

  const createSnapshot = useCallback(async (
    projectId: string,
    code: string,
    label: string,
    createdBy: 'user' | 'ai',
  ) => {
    const versions = await api.createVersion(projectId, { code, label, created_by: createdBy }, userId)
    actions.replaceVersions(versions)
    return versions
  }, [actions, userId])

  const saveVersionSnapshot = useCallback(async (
    project: Project,
    code: string,
    label: string,
    createdBy: 'user' | 'ai',
  ) => {
    const persistedProject = await persistProject({
      ...project,
      strudel_code: code,
      bpm: parseBpmFromCode(code),
      key: parseKeyFromCode(code),
    })

    try {
      await createSnapshot(persistedProject.id, code, label, createdBy)
      await loadVersions(persistedProject.id)
    } catch (error) {
      setVersionError(error instanceof Error ? error.message : 'Failed to save snapshot.')
    }

    return persistedProject
  }, [createSnapshot, loadVersions, persistProject])

  const loadProject = useCallback(async (projectId?: string | null) => {
    setIsLoadingProject(true)

    const requestedTemplate = searchParams.get('template')
    if (requestedTemplate === 'empty' || requestedTemplate === 'demo') {
      const project = createProjectTemplate(userId, requestedTemplate)
      actions.setProject(project)
      saveLocalProject(project)
      setSearchParams({ project: project.id })
      setIsLoadingProject(false)
      return
    }

    const nextProjectId = projectId || searchParams.get('project') || getLastProjectId()

    if (!nextProjectId) {
      const project = createProjectTemplate(userId, 'demo')
      actions.setProject(project)
      saveLocalProject(project)
      setSearchParams({ project: project.id })
      setIsLoadingProject(false)
      return
    }

    const localProject = loadLocalProject(nextProjectId)
    if (localProject) {
      const project = normalizeProjectCode(localProject)
      actions.setProject(project)
      saveLocalProject(project)
      setSearchParams({ project: project.id })
      setIsLoadingProject(false)
      return
    }

    try {
      const remoteProject = normalizeProjectCode(await api.getProject(nextProjectId, userId))
      actions.setProject(remoteProject)
      saveLocalProject(remoteProject)
      setSearchParams({ project: remoteProject.id })
      await loadVersions(remoteProject.id)
    } catch {
      const fallbackProject = createProjectTemplate(userId, 'demo')
      actions.setProject(fallbackProject)
      saveLocalProject(fallbackProject)
      setSearchParams({ project: fallbackProject.id })
    } finally {
      setIsLoadingProject(false)
    }
  }, [actions, loadVersions, searchParams, setSearchParams, userId])

  useEffect(() => {
    const shareId = routeShareId || searchParams.get('share')
    if (shareId) {
      if (loadedShareIdRef.current === shareId) return
      loadedShareIdRef.current = shareId

      api.loadSharedCode(shareId).then((data) => {
        const project = createProjectTemplate(userId, 'demo')
        project.id = createId()
        project.name = `${data.title || 'Shared Session'} Remix`
        project.strudel_code = normalizeNamedTrackSyntax(data.code)
        project.chat_history = [
          {
            id: createId(),
            role: 'system',
            content: 'Loaded a public read-only share as your own remixable copy. Save or edit it without changing the original share.',
            timestamp: new Date().toISOString(),
          },
        ]
        project.bpm = parseBpmFromCode(project.strudel_code)
        project.key = parseKeyFromCode(project.strudel_code)
        project.tags = ['shared', 'remix']
        actions.setProject(project)
        saveLocalProject(project)
        setRemixNotice(`Remixing ${data.title || 'shared session'}. Your edits will not change the original.`)
        navigate(`/?project=${project.id}`, { replace: true })
        setIsLoadingProject(false)
      }).catch(() => {
        loadedShareIdRef.current = null
        void loadProject(null)
      })
      return
    }

    void loadProject(null)
  }, [actions, loadProject, navigate, routeShareId, searchParams, setSearchParams, userId])

  useEffect(() => {
    if (!currentProject) return
    editorBridgeRef.current.setCode?.(currentProject.strudel_code)
  }, [currentProject?.id, currentProject?.strudel_code])

  useEffect(() => {
    if (!currentProject || !isDirty) return

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      void persistProject({ ...currentProject, chat_history: useProjectStore.getState().chatMessages })
    }, 3000)

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [currentProject, isDirty, persistProject])

  const stopPreview = useCallback((messageId?: string) => {
    const currentMessageId = messageId ?? previewMessageIdRef.current
    if (!currentMessageId) return

    const snapshot = previewSnapshotRef.current
    if (snapshot !== null) {
      editorBridgeRef.current.setCode?.(snapshot)
      actions.setCode(snapshot)
    }

    editorBridgeRef.current.stop?.()
    actions.setDiffPreviewing(currentMessageId, false)
    previewSnapshotRef.current = null
    previewMessageIdRef.current = null
  }, [actions])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifierKey = navigator.platform.includes('Mac') ? event.metaKey : event.ctrlKey
      const target = event.target as HTMLElement | null
      const isInteractiveTarget = !!target && (
        target.tagName === 'TEXTAREA'
        || target.tagName === 'INPUT'
        || target.tagName === 'SELECT'
        || target.tagName === 'BUTTON'
        || target.tagName === 'A'
        || target.isContentEditable
        || !!target.closest('[role="button"],[role="tab"],[role="menuitem"],[role="option"]')
      )

      if (event.code === 'Space') {
        if (!isInteractiveTarget) {
          event.preventDefault()
          if (isPlaying) {
            editorBridgeRef.current.stop?.()
          } else {
            editorBridgeRef.current.play?.()
          }
        }
      }

      if (event.key === '?' && !isInteractiveTarget) {
        event.preventDefault()
        setShowShortcuts((current) => !current)
      }

      if (event.key === 'Escape') {
        if (previewMessageIdRef.current) {
          event.preventDefault()
          stopPreview(previewMessageIdRef.current)
          return
        }

        if (showShortcuts) {
          event.preventDefault()
          setShowShortcuts(false)
        }
      }

      if (modifierKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (!currentProject) return
        void saveVersionSnapshot(currentProject, getCurrentCode(), 'Manual save', 'user')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentProject, getCurrentCode, isPlaying, saveVersionSnapshot, showShortcuts, stopPreview])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = editorBridgeRef.current.getCycleInfo?.() ?? null
      // Bail out when nothing changed so idle playback does not re-render the app.
      setCycleInfo((previous) => {
        if (!next) return previous === null ? previous : null
        if (
          previous
          && previous.phase === next.phase
          && previous.cps === next.cps
          && previous.cycleDurationMs === next.cycleDurationMs
        ) {
          return previous
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => () => {
    if (paramEvaluateTimerRef.current) {
      window.clearTimeout(paramEvaluateTimerRef.current)
    }
    if (typingEvaluateTimerRef.current) {
      window.clearTimeout(typingEvaluateTimerRef.current)
    }
    if (flushStreamFrameRef.current) {
      window.cancelAnimationFrame(flushStreamFrameRef.current)
    }
    activeChatAbortRef.current?.abort()
  }, [])

  const onPreviewDiff = useCallback((messageId: string, diff: CodeDiff) => {
    previewSnapshotRef.current = getCurrentCode()
    previewMessageIdRef.current = messageId
    editorBridgeRef.current.setCode?.(diff.after)
    actions.setCode(diff.after)
    if (!isPlaying) {
      editorBridgeRef.current.play?.()
    } else {
      window.setTimeout(() => editorBridgeRef.current.evaluate?.(), 60)
    }
    actions.setDiffPreviewing(messageId, true)
  }, [actions, getCurrentCode, isPlaying])

  const onApplyDiff = useCallback(async (messageId: string, diff: CodeDiff) => {
    if (!currentProject) return

    previewSnapshotRef.current = null
    previewMessageIdRef.current = null
    editorBridgeRef.current.setCode?.(diff.after)
    actions.setCode(diff.after)

    if (isPlaying) {
      window.setTimeout(() => editorBridgeRef.current.evaluate?.(), 60)
    }

    actions.applyDiff(messageId)
    await saveVersionSnapshot(currentProject, diff.after, 'Applied AI patch', 'ai')
  }, [actions, currentProject, isPlaying, saveVersionSnapshot])

  const onSend = useCallback(async (content: string) => {
    if (!currentProject) return
    const trimmedContent = content.trim()
    if (!trimmedContent || pendingSendContentsRef.current.has(trimmedContent)) return

    pendingSendContentsRef.current.add(trimmedContent)
    setIsSending(true)
    setChatError(null)
    setChatStatus('Connecting to the AI stream...')
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: trimmedContent,
      timestamp: new Date().toISOString(),
    }

    const streamingAssistantId = createId()
    const nextMessages = [...useProjectStore.getState().chatMessages, userMessage, {
      id: streamingAssistantId,
      role: 'assistant' as const,
      content: '',
      timestamp: new Date().toISOString(),
    }]

    actions.setChatMessages(nextMessages)

    const currentCode = getCurrentCode()
    const existingMessages = useProjectStore.getState().chatMessages.filter((message) => message.id !== streamingAssistantId)
    const modelMessageCap = getModelMessageCap(selectedModel)
    const trimmedMessages = trimChatHistoryForApi(existingMessages).slice(-modelMessageCap)
    const summarySource = existingMessages.filter((message) => message.role !== 'system').slice(0, Math.max(0, existingMessages.length - modelMessageCap))
    const nextSummary = summarizeMessages(summarySource)
    setChatSummary(nextSummary)
    const messagesForApi = nextSummary
      ? [{ role: 'system' as const, content: nextSummary }, ...trimmedMessages]
      : trimmedMessages
    // Only send a custom prompt when the user actually customized it; the
    // default template is redundant with the server's base prompt.
    const trimmedCustomPrompt = customSystemPrompt.trim()
    const effectiveCustomPrompt = trimmedCustomPrompt && trimmedCustomPrompt !== DEFAULT_CUSTOM_PROMPT_TEMPLATE.trim()
      ? trimmedCustomPrompt
      : undefined
    const nextApproxTokenUsage = estimateTokens(currentCode)
      + estimateTokens(effectiveCustomPrompt ?? '')
      + (nextSummary ? estimateTokens(nextSummary) : 0)
      + messagesForApi.reduce((sum, message) => sum + estimateTokens(message.content), 0)
    setApproxTokenUsage(nextApproxTokenUsage)
    const payload = {
      project_id: currentProject.id,
      messages: messagesForApi,
      current_code: currentCode,
      model: selectedModel,
      system_prompt_mode: systemPromptMode,
      custom_system_prompt: effectiveCustomPrompt,
      provider: customProvider ?? undefined,
      project_meta: {
        bpm: currentProject.bpm,
        key: currentProject.key,
        tags: currentProject.tags,
      },
    }
    let requestEndedWithError = false
    // Cancel any in-flight request before starting a new one.
    activeChatAbortRef.current?.abort()
    const abortController = new AbortController()
    activeChatAbortRef.current = abortController

    const runChatOnce = async (correction?: string) => api.chatStream(
      correction
        ? { ...payload, messages: [...payload.messages, { role: 'user' as const, content: correction }] }
        : payload,
      userId,
      {
      signal: abortController.signal,
      onChunk: (chunk) => {
        setChatStatus('Streaming response...')
        bufferedStreamContentRef.current += chunk
        const now = performance.now()

        const flushBufferedChunk = () => {
          if (!bufferedStreamContentRef.current) return
          const bufferedChunk = bufferedStreamContentRef.current
          bufferedStreamContentRef.current = ''
          lastStreamUpdateRef.current = performance.now()
          const messages = useProjectStore.getState().chatMessages.map((message) =>
            message.id === streamingAssistantId ? { ...message, content: `${message.content}${bufferedChunk}` } : message,
          )
          actions.setChatMessages(messages)
        }

        if (now - lastStreamUpdateRef.current < 50) {
          if (!flushStreamFrameRef.current) {
            flushStreamFrameRef.current = window.requestAnimationFrame(() => {
              flushStreamFrameRef.current = null
              flushBufferedChunk()
            })
          }
          return
        }

        flushBufferedChunk()
      },
      onDone: (finalResponse) => {
        // Cancel any pending throttled flush so it cannot append raw stream
        // tokens onto the finalized assistant message.
        if (flushStreamFrameRef.current) {
          window.cancelAnimationFrame(flushStreamFrameRef.current)
          flushStreamFrameRef.current = null
        }
        bufferedStreamContentRef.current = ''
        setChatError(null)
        setChatStatus(finalResponse.has_code_change ? 'Patch ready for review.' : 'Response ready.')
        const assistantMessage: ChatMessage = {
          id: streamingAssistantId,
          role: 'assistant',
          content: finalResponse.message,
          timestamp: new Date().toISOString(),
        }

        if (finalResponse.has_code_change && finalResponse.code) {
          const diff = buildCodeDiff(currentCode, finalResponse.code, finalResponse.diff_summary || 'Updated the Strudel arrangement')
          assistantMessage.code_diff = diff
          assistantMessage.status = yoloMode ? 'applied' : 'pending'
        }

        const finalizedMessages = useProjectStore.getState().chatMessages.map((message) =>
          message.id === streamingAssistantId ? assistantMessage : message,
        )
        actions.setChatMessages(finalizedMessages)

        if (assistantMessage.code_diff) {
          actions.setPendingDiff(assistantMessage.id, assistantMessage.code_diff)
          if (yoloMode) {
            void onApplyDiff(assistantMessage.id, assistantMessage.code_diff)
          }
        }
      },
      onStreamError: (error) => {
        requestEndedWithError = true
        setChatError(getFriendlyChatError(error))
      },
    })

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          bufferedStreamContentRef.current = ''
          if (flushStreamFrameRef.current) {
            window.cancelAnimationFrame(flushStreamFrameRef.current)
            flushStreamFrameRef.current = null
          }
          await runChatOnce()
          break
        } catch (error) {
          const shouldRetry = attempt === 0 && isRetryableEmptyResponseError(error)
          if (shouldRetry) {
            // Clear the previous attempt's error so a successful retry is not
            // still reported as failed.
            requestEndedWithError = false
            setChatError(null)
            const resetMessages = useProjectStore.getState().chatMessages.map((message) =>
              message.id === streamingAssistantId ? { ...message, content: '' } : message,
            )
            actions.setChatMessages(resetMessages)
            await runChatOnce(
              'Your previous reply did not match the required JSON contract. Reply again with ONLY the JSON object '
              + '(message, code, diff_summary, has_code_change) and, if code changes, the FULL updated code with newlines escaped as \\n.',
            )
            break
          }

          throw error
        }
      }
    } catch (error) {
      // A cancelled request (unmount or a newer send) is not an error to show.
      if (isAbortError(error)) {
        return
      }
      requestEndedWithError = true
      const errorText = getFriendlyChatError(error)
      setChatError(errorText)
      setChatStatus(null)
      const messages = useProjectStore.getState().chatMessages.map((message) =>
        message.id === streamingAssistantId
          ? { ...message, content: `⚠️ ${errorText}`, status: 'error' as const }
          : message,
      )
      actions.setChatMessages(messages)
    } finally {
      setIsSending(false)
      pendingSendContentsRef.current.delete(trimmedContent)
      if (activeChatAbortRef.current === abortController) {
        activeChatAbortRef.current = null
      }
      if (!requestEndedWithError) {
        window.setTimeout(() => setChatStatus((current) => (current === 'Patch ready for review.' || current === 'Response ready.' ? null : current)), 2500)
      }
    }
  }, [actions, currentProject, customProvider, customSystemPrompt, getCurrentCode, onApplyDiff, selectedModel, systemPromptMode, userId, yoloMode])

  const onRetryLast = useCallback(async () => {
    const lastUser = useProjectStore.getState().chatMessages
      .slice()
      .reverse()
      .find((message) => message.role === 'user')
    if (!lastUser || !lastUser.content.trim()) return
    await onSend(lastUser.content)
  }, [onSend])

  const onRejectDiff = useCallback((messageId: string) => {
    if (previewMessageIdRef.current === messageId) {
      stopPreview(messageId)
    }
    actions.rejectDiff(messageId)
  }, [actions, stopPreview])

  const onParamChange = useCallback((param: ExtractedParam, nextValue: number) => {
    const sourceCode = getCurrentCode()
    const nextCode = updateDetectedParamInCode(sourceCode, param, nextValue)
    editorBridgeRef.current.setCode?.(nextCode)
    actions.setCode(nextCode)

    if (isPlaying) {
      if (paramEvaluateTimerRef.current) {
        window.clearTimeout(paramEvaluateTimerRef.current)
      }

      paramEvaluateTimerRef.current = window.setTimeout(() => {
        editorBridgeRef.current.evaluate?.()
      }, 120)
    }
  }, [actions, getCurrentCode, isPlaying])

  const onParamCommit = useCallback((param: ExtractedParam, nextValue: number) => {
    if (!currentProject) return
    const nextCode = updateDetectedParamInCode(getCurrentCode(), param, nextValue)
    const latestVersionCode = currentProject.versions[0]?.code
    if (latestVersionCode === nextCode) {
      return
    }
    actions.upsertVersion(nextCode, 'param edit', 'user')
    void saveVersionSnapshot(currentProject, nextCode, 'param edit', 'user')
  }, [actions, currentProject, getCurrentCode, saveVersionSnapshot])

  const onTrackGainChange = useCallback((trackGain: TrackGain, value: number) => {
    const code = getCurrentCode()
    let nextCode: string
    if (trackGain.hasGain && trackGain.gainStart >= 0) {
      nextCode = `${code.slice(0, trackGain.gainStart)}${value.toFixed(2)}${code.slice(trackGain.gainEnd)}`
    } else {
      const tracks = parseTracks(code)
      const track = tracks.find(t => t.id === trackGain.trackId)
      if (!track) return
      const updated = `${track.source.trimEnd()}\n  .gain(${value.toFixed(2)})\n`
      nextCode = `${code.slice(0, track.start)}${updated}${code.slice(track.end)}`
    }
    editorBridgeRef.current.setCode?.(nextCode)
    actions.setCode(nextCode)
    if (isPlaying) {
      if (paramEvaluateTimerRef.current) window.clearTimeout(paramEvaluateTimerRef.current)
      paramEvaluateTimerRef.current = window.setTimeout(() => editorBridgeRef.current.evaluate?.(), 120)
    }
  }, [actions, getCurrentCode, isPlaying])

  const onTrackGainCommit = useCallback((trackGain: TrackGain, value: number) => {
    if (!currentProject) return
    const code = getCurrentCode()
    let nextCode: string
    if (trackGain.hasGain && trackGain.gainStart >= 0) {
      nextCode = `${code.slice(0, trackGain.gainStart)}${value.toFixed(2)}${code.slice(trackGain.gainEnd)}`
    } else {
      const tracks = parseTracks(code)
      const track = tracks.find(t => t.id === trackGain.trackId)
      if (!track) return
      const updated = `${track.source.trimEnd()}\n  .gain(${value.toFixed(2)})\n`
      nextCode = `${code.slice(0, track.start)}${updated}${code.slice(track.end)}`
    }
    void saveVersionSnapshot(currentProject, nextCode, 'track gain edit', 'user')
  }, [currentProject, getCurrentCode, saveVersionSnapshot])

  const onTrackPanChange = useCallback((trackGain: TrackGain, value: number) => {
    const clampedValue = Math.min(1, Math.max(-1, value))
    const code = getCurrentCode()
    let nextCode: string
    if (trackGain.hasPan && trackGain.panStart >= 0) {
      nextCode = `${code.slice(0, trackGain.panStart)}${clampedValue.toFixed(2)}${code.slice(trackGain.panEnd)}`
    } else {
      const tracks = parseTracks(code)
      const track = tracks.find(t => t.id === trackGain.trackId)
      if (!track) return
      const updated = `${track.source.trimEnd()}\n  .pan(${clampedValue.toFixed(2)})\n`
      nextCode = `${code.slice(0, track.start)}${updated}${code.slice(track.end)}`
    }
    editorBridgeRef.current.setCode?.(nextCode)
    actions.setCode(nextCode)
    if (isPlaying) {
      if (paramEvaluateTimerRef.current) window.clearTimeout(paramEvaluateTimerRef.current)
      paramEvaluateTimerRef.current = window.setTimeout(() => editorBridgeRef.current.evaluate?.(), 120)
    }
  }, [actions, getCurrentCode, isPlaying])

  const onTrackPanCommit = useCallback((trackGain: TrackGain, value: number) => {
    if (!currentProject) return
    const clampedValue = Math.min(1, Math.max(-1, value))
    const code = getCurrentCode()
    let nextCode: string
    if (trackGain.hasPan && trackGain.panStart >= 0) {
      nextCode = `${code.slice(0, trackGain.panStart)}${clampedValue.toFixed(2)}${code.slice(trackGain.panEnd)}`
    } else {
      const tracks = parseTracks(code)
      const track = tracks.find(t => t.id === trackGain.trackId)
      if (!track) return
      const updated = `${track.source.trimEnd()}\n  .pan(${clampedValue.toFixed(2)})\n`
      nextCode = `${code.slice(0, track.start)}${updated}${code.slice(track.end)}`
    }
    void saveVersionSnapshot(currentProject, nextCode, 'track pan edit', 'user')
  }, [currentProject, getCurrentCode, saveVersionSnapshot])

  const onRestoreVersion = useCallback(async (version: CodeVersion) => {
    if (!currentProject) return

    setIsRestoringVersion(true)
    setVersionError(null)

    try {
      for (const messageId of useProjectStore.getState().pendingDiffs.keys()) {
        actions.rejectDiff(messageId)
      }
      if (previewMessageIdRef.current) {
        stopPreview(previewMessageIdRef.current)
      }

      const currentCode = getCurrentCode()
      await saveVersionSnapshot(currentProject, currentCode, 'Before restore', 'user')

      editorBridgeRef.current.setCode?.(version.code)
      actions.setCode(version.code)

      await persistProject({
        ...currentProject,
        strudel_code: version.code,
        bpm: parseBpmFromCode(version.code),
        key: parseKeyFromCode(version.code),
      })

      await loadVersions(currentProject.id)
    } catch (error) {
      setVersionError(error instanceof Error ? error.message : 'Failed to restore version.')
    } finally {
      setIsRestoringVersion(false)
    }
  }, [actions, currentProject, getCurrentCode, loadVersions, persistProject, saveVersionSnapshot, stopPreview])

  const onSelectSection = useCallback((section: SectionMarker) => {
    actions.setActiveSection(section.label)
    editorBridgeRef.current.jumpToLine?.(section.line)
    if (window.matchMedia('(max-width: 1024px)').matches) {
      editorContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [actions])

  const onPlay = useCallback(() => editorBridgeRef.current.play?.(), [])
  const onStop = useCallback(() => editorBridgeRef.current.stop?.(), [])
  const onUndo = useCallback(() => editorBridgeRef.current.undo?.(), [])
  const onRedo = useCallback(() => editorBridgeRef.current.redo?.(), [])

  const onManualSave = useCallback(async () => {
    if (!currentProject) return
    await saveVersionSnapshot(currentProject, getCurrentCode(), 'Manual save', 'user')
  }, [currentProject, getCurrentCode, saveVersionSnapshot])

  const onLoadTemplateProject = useCallback((template: 'empty' | 'demo') => {
    if (isPlaying) {
      editorBridgeRef.current.stop?.()
    }

    for (const messageId of useProjectStore.getState().pendingDiffs.keys()) {
      actions.rejectDiff(messageId)
    }

    const project = createProjectTemplate(userId, template)
    editorBridgeRef.current.setCode?.(project.strudel_code)
    actions.setProject(project)
    saveLocalProject(project)
    setSearchParams({ project: project.id })
    setShareUrl(null)
    setShareError(null)
    setShareStatus(null)
    setVersionError(null)
  }, [actions, isPlaying, setSearchParams, userId])

  const onShare = useCallback(async () => {
    if (!currentProject) return
    setIsSharing(true)
    setShareError(null)
    setShareStatus('Creating share...')
    try {
      const response = await api.shareCode(getCurrentCode(), currentProject.name)
      setShareUrl(response.url)
      setLastSharedAt(new Date().toISOString())
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(response.url)
          setShareStatus('Share link copied')
        } catch {
          setShareStatus('Share link ready')
        }
      } else {
        setShareStatus('Share link ready')
      }
    } catch (error) {
      setShareUrl(null)
      setShareError(error instanceof Error ? error.message : 'Unable to create share link.')
      setShareStatus('Share failed')
    } finally {
      setIsSharing(false)
    }
  }, [currentProject, getCurrentCode])

  useEffect(() => {
    if (!shareStatus || shareStatus === 'Creating share...') return
    const timeout = window.setTimeout(() => setShareStatus(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [shareStatus])

  const onExportTxt = useCallback(() => {
    if (!currentProject) return
    downloadFile(`${currentProject.name}.txt`, getCurrentCode(), 'text/plain')
  }, [currentProject, getCurrentCode])

  const onExportProject = useCallback(() => {
    if (!currentProject) return
    downloadFile(`${currentProject.name}.strudel`, JSON.stringify({ ...currentProject, strudel_code: getCurrentCode() }, null, 2), 'application/json')
  }, [currentProject, getCurrentCode])

  const onBpmChange = useCallback((bpm: number) => {
    const nextCode = upsertSetcpsFromBpm(getCurrentCode(), bpm)
    editorBridgeRef.current.setCode?.(nextCode)
    actions.setCode(nextCode)
  }, [actions, getCurrentCode])

  const syncEditorCode = useCallback((code: string, evaluate = false) => {
    editorBridgeRef.current.setCode?.(code)
    actions.setCode(code)
    if (evaluate && isPlaying) {
      window.setTimeout(() => editorBridgeRef.current.evaluate?.(), 60)
    }
  }, [actions, isPlaying])

  const setEditorCode = useCallback((code: string) => {
    editorBridgeRef.current.setCode?.(code)
    actions.setCode(code)
  }, [actions])

  const onInjectCode = useCallback((snippet: string) => {
    const currentCode = getCurrentCode().trimEnd()
    const nextCode = `${currentCode}\n\n${snippet.trim()}\n`
    syncEditorCode(nextCode, true)
  }, [getCurrentCode, syncEditorCode])

  const onApplyGeneratedCode = useCallback((code: string) => {
    syncEditorCode(code, true)
  }, [syncEditorCode])

  const onShuffleRhythm = useCallback(() => {
    syncEditorCode(mutateDrumTracks(getCurrentCode()), true)
  }, [getCurrentCode, syncEditorCode])

  const onAddVariation = useCallback(() => {
    syncEditorCode(addVariationToRandomTrack(getCurrentCode()), true)
  }, [getCurrentCode, syncEditorCode])

  const onRandomReverb = useCallback(() => {
    syncEditorCode(addRandomReverbToTracks(getCurrentCode()), true)
  }, [getCurrentCode, syncEditorCode])

  const onJuxRev = useCallback(() => {
    syncEditorCode(addJuxRevToRandomMelodicTrack(getCurrentCode()), true)
  }, [getCurrentCode, syncEditorCode])

  const onProjectNameChange = useCallback((name: string) => actions.setProjectName(name), [actions])
  const onProjectKeyChange = useCallback((key: string) => actions.setProjectKey(key), [actions])
  const onProjectLightingChange = useCallback((lighting: LightingProjectState) => actions.setLighting(lighting), [actions])
  const onCustomApiEndpointChange = useCallback((endpoint: string) => {
    setCustomApiEndpoint(endpoint)
  }, [])
  const onCustomApiKeyChange = useCallback((apiKey: string) => {
    setCustomApiKey(apiKey)
  }, [])
  const onCustomSystemPromptChange = useCallback((prompt: string) => {
    setCustomSystemPrompt(prompt)
    if (customProvider) {
      saveChatProviderConfig({
        endpoint: customProvider.endpoint,
        apiKey: customProvider.apiKey,
        selectedModel,
        systemPromptMode,
        customSystemPrompt: prompt,
      })
    }
  }, [customProvider, selectedModel, systemPromptMode])
  const onLoadDefaultPromptTemplate = useCallback(() => {
    setCustomSystemPrompt(DEFAULT_CUSTOM_PROMPT_TEMPLATE)
  }, [])
  const onLoadImprovedPromptTemplate = useCallback(() => {
    setCustomSystemPrompt(IMPROVED_CUSTOM_PROMPT_TEMPLATE)
  }, [])
  const onPromptPresetNameChange = useCallback((label: string) => {
    setPromptPresetName(label)
  }, [])
  const onSavePromptPreset = useCallback(() => {
    const nextPresets = upsertPromptPreset(promptPresetName, customSystemPrompt)
    setSavedPromptPresets(nextPresets)
    if (!promptPresetName.trim()) {
      setPromptPresetName('Untitled prompt')
    }
  }, [customSystemPrompt, promptPresetName])
  const onLoadSavedPromptPreset = useCallback((content: string) => {
    setCustomSystemPrompt(content)
  }, [])
  const onModelChange = useCallback((model: string) => {
    actions.setSelectedModel(model)
    if (customProvider) {
      saveChatProviderConfig({
        endpoint: customProvider.endpoint,
        apiKey: customProvider.apiKey,
        selectedModel: model,
        systemPromptMode,
        customSystemPrompt,
      })
    }
  }, [actions, customProvider, customSystemPrompt, systemPromptMode])
  const onSystemPromptModeChange = useCallback((mode: SystemPromptMode) => {
    actions.setSystemPromptMode(mode)
    if (customProvider) {
      saveChatProviderConfig({
        endpoint: customProvider.endpoint,
        apiKey: customProvider.apiKey,
        selectedModel,
        systemPromptMode: mode,
        customSystemPrompt,
      })
    }
  }, [actions, customProvider, customSystemPrompt, selectedModel])
  const onLoadModels = useCallback(async () => {
    const nextProvider = formatProviderConfig(customApiEndpoint, customApiKey)
    if (!nextProvider) {
      activeProviderRef.current = null
      setAvailableModels([DEFAULT_CHAT_MODEL])
      setModelLoadError('Enter both a custom endpoint and API key before loading models.')
      actions.setSelectedModel(DEFAULT_CHAT_MODEL)
      saveChatProviderConfig(null)
      return
    }

    setIsLoadingModels(true)
    setModelLoadError(null)

    try {
      const response = await api.getChatModels(nextProvider, userId)
      const models = response.models.length > 0 ? response.models : [DEFAULT_CHAT_MODEL]
      activeProviderRef.current = nextProvider
      setAvailableModels(models)

      const nextModel = models.includes(selectedModel) ? selectedModel : models[0]
      actions.setSelectedModel(nextModel)
      saveChatProviderConfig({
        endpoint: nextProvider.endpoint,
        apiKey: nextProvider.apiKey,
        selectedModel: nextModel,
        systemPromptMode,
        customSystemPrompt,
      })
    } catch (error) {
      activeProviderRef.current = null
      setAvailableModels([DEFAULT_CHAT_MODEL])
      setModelLoadError(error instanceof Error ? error.message : 'Failed to load models')
      actions.setSelectedModel(DEFAULT_CHAT_MODEL)
    } finally {
      setIsLoadingModels(false)
    }
  }, [actions, customApiEndpoint, customApiKey, customSystemPrompt, selectedModel, systemPromptMode, userId])
  const onMasterVolumeChange = useCallback((volume: number) => {
    const nextVolume = Math.min(1, Math.max(0, volume))
    masterVolumeRef.current = nextVolume
    setMasterVolume(nextVolume)
    editorBridgeRef.current.setMasterVolume?.(nextVolume)
  }, [])
  const onEditorAnalyserReady = useCallback((analyser: AnalyserNode) => {
    setAudioAnalyser(analyser)
  }, [])
  const onEditorCodeChange = useCallback((code: string) => actions.setCode(code), [actions])
  const onEditorActivity = useCallback(() => {
    if (!useProjectStore.getState().isPlaying) {
      return
    }

    if (typingEvaluateTimerRef.current) {
      window.clearTimeout(typingEvaluateTimerRef.current)
    }

    typingEvaluateTimerRef.current = window.setTimeout(() => {
      editorBridgeRef.current.evaluate?.()
      typingEvaluateTimerRef.current = null
    }, 300)
  }, [])
  const onEditorPlayStateChange = useCallback((playing: boolean) => actions.setPlaying(playing), [actions])
  const onEditorStrudelError = useCallback((error: string | null) => actions.setStrudelError(error), [actions])
  const onEditorCodeEvaluated = useCallback(() => actions.setStrudelError(null), [actions])

  return {
    currentProject,
    chatMessages,
    pendingDiffs,
    sections,
    activeSection,
    params,
    selectedModel,
    systemPromptMode,
    isDirty,
    isSaving,
    saveError,
    isPlaying,
    strudelError,
    shareUrl,
    cycleInfo,
    isEditorInitialized,
    isEditorInitializing,
    isLoadingProject,
    isLoadingVersions,
    isRestoringVersion,
    versionError,
    showShortcuts,
    isRhythmGeneratorCollapsed,
    isArrangePanelCollapsed,
    isFxRackCollapsed,
    isSending,
    yoloMode,
    masterVolume,
    audioAnalyser,
    customApiEndpoint,
    customApiKey,
    customSystemPrompt,
    savedPromptPresets,
    promptPresetName,
    availableModels,
    isLoadingModels,
    modelLoadError,
    shareError,
    shareStatus,
    remixNotice,
    isSharing,
    lastSharedAt,
    chatSummary,
    approxTokenUsage,
    chatStatus,
    chatError,
    editorContainerRef,
    registerEditor,
    getCurrentCode,
    getTrackActivity: () => editorBridgeRef.current.getTrackActivity?.() ?? { activeTracks: [], cycleStart: 0, cycleEnd: 0 },
    onSend,
    onRetryLast,
    onApplyDiff,
    onRejectDiff,
    onPreviewDiff,
    onStopPreview: stopPreview,
    onParamChange,
    onParamCommit,
    onTrackGainChange,
    onTrackGainCommit,
    onTrackPanChange,
    onTrackPanCommit,
    onRestoreVersion,
    onLoadTemplateProject,
    onShare,
    onExportTxt,
    onExportProject,
    onPlay,
    onStop,
    onUndo,
    onRedo,
    onManualSave,
    onSelectSection,
    onBpmChange,
    setEditorCode,
    onInjectCode,
    onApplyGeneratedCode,
    onShuffleRhythm,
    onAddVariation,
    onRandomReverb,
    onJuxRev,
    onProjectNameChange,
    onProjectKeyChange,
    onProjectLightingChange,
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
    onMasterVolumeChange,
    setYoloMode,
    onEditorAnalyserReady,
    onEditorCodeChange,
    onEditorActivity,
    loadVersions,
    onEditorPlayStateChange,
    onEditorStrudelError,
    onEditorCodeEvaluated,
    setShowShortcuts,
    dismissRemixNotice: () => setRemixNotice(null),
    toggleRhythmGenerator: () => setIsRhythmGeneratorCollapsed((current) => !current),
    toggleArrangePanel: () => setIsArrangePanelCollapsed((current) => !current),
    toggleFxRack: () => setIsFxRackCollapsed((current) => !current),
    setEditorInitState: (initialized: boolean, initializing: boolean) => {
      setIsEditorInitialized(initialized)
      setIsEditorInitializing(initializing)
    },
  }
}

export type UseChatOrchestratorResult = ReturnType<typeof useChatOrchestrator>
