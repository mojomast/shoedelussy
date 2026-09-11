import { DEFAULT_SYSTEM_PROMPT_MODE } from '@/types/project'
import type { Project, SavedPromptPreset, SystemPromptMode } from '@/types/project'
import { createId } from '@/lib/utils'

const PROJECTS_KEY = 'shoedelussy.projects'
const LEGACY_PROJECTS_KEY = 'strudelussy.projects'
const LAST_PROJECT_KEY = 'shoedelussy.lastProjectId'
const LEGACY_LAST_PROJECT_KEY = 'strudelussy.lastProjectId'
const USER_KEY = 'shoedelussy.userId'
const LEGACY_USER_KEY = 'strudelussy.userId'
const CHAT_PROVIDER_KEY = 'shoedelussy.chatProvider'
const LEGACY_CHAT_PROVIDER_KEY = 'strudelussy.chatProvider'
const PROMPT_PRESETS_KEY = 'shoedelussy.promptPresets'
const LEGACY_PROMPT_PRESETS_KEY = 'strudelussy.promptPresets'
const TUTORIAL_PROGRESS_KEY = 'shoedelussy:tutorialProgress'
const LEGACY_TUTORIAL_PROGRESS_KEY = 'strudelussy_tutorial_progress'
const LEGACY_TUTORIAL_PROGRESS_KEY_ALT = 'strudelussy:tutorialProgress'

export interface TutorialProgressData {
  completedLessons: string[]
  currentLessonId: string | null
  revealedHintCount: number
}

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const safeGetItem = (key: string): string | null => {
  try {
    return canUseStorage() ? window.localStorage.getItem(key) : null
  } catch {
    return null
  }
}

const safeSetItem = (key: string, value: string): boolean => {
  try {
    if (!canUseStorage()) return false
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const safeRemoveItem = (key: string): void => {
  try {
    if (canUseStorage()) window.localStorage.removeItem(key)
  } catch {
    // Ignore unavailable storage and quota/security errors.
  }
}

const getStorageItem = (...keys: string[]): string | null => {
  for (const key of keys) {
    const value = safeGetItem(key)
    if (value === null) continue

    if (key !== keys[0]) {
      safeSetItem(keys[0], value)
    }

    return value
  }

  return null
}

const normalizeSystemPromptMode = (value?: string): SystemPromptMode => (
  value === 'legacy-toaster' ? 'legacy-toaster' : DEFAULT_SYSTEM_PROMPT_MODE
)

const readProjects = (): Record<string, Project> => {
  if (!canUseStorage()) return {}
  const raw = getStorageItem(PROJECTS_KEY, LEGACY_PROJECTS_KEY)
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, Project>
  } catch {
    return {}
  }
}

const writeProjects = (projects: Record<string, Project>) => {
  safeSetItem(PROJECTS_KEY, JSON.stringify(projects))
}

export const getOrCreateGuestUserId = (): string => {
  if (!canUseStorage()) {
    return 'guest-session'
  }

  const existing = getStorageItem(USER_KEY, LEGACY_USER_KEY)
  if (existing) return existing

  const created = createId('guest')
  safeSetItem(USER_KEY, created)
  return created
}

export const saveLocalProject = (project: Project) => {
  const projects = readProjects()
  projects[project.id] = project
  writeProjects(projects)
  safeSetItem(LAST_PROJECT_KEY, project.id)
}

export const loadLocalProject = (projectId: string): Project | null => {
  const projects = readProjects()
  return projects[projectId] ?? null
}

export const listLocalProjects = (): Project[] => {
  return Object.values(readProjects()).sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export const deleteLocalProject = (projectId: string) => {
  const projects = readProjects()
  delete projects[projectId]
  writeProjects(projects)
}

export const getLastProjectId = (): string | null => {
  return getStorageItem(LAST_PROJECT_KEY, LEGACY_LAST_PROJECT_KEY)
}

export interface StoredChatProviderConfig {
  endpoint: string
  apiKey: string
  selectedModel: string
  systemPromptMode: SystemPromptMode
  customSystemPrompt: string
}

export const loadChatProviderConfig = (): StoredChatProviderConfig | null => {
  if (!canUseStorage()) return null
  const raw = getStorageItem(CHAT_PROVIDER_KEY, LEGACY_CHAT_PROVIDER_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredChatProviderConfig>
    return {
      endpoint: parsed.endpoint || '',
      apiKey: parsed.apiKey || '',
      selectedModel: parsed.selectedModel || '',
      systemPromptMode: normalizeSystemPromptMode(parsed.systemPromptMode),
      customSystemPrompt: parsed.customSystemPrompt || '',
    }
  } catch {
    return null
  }
}

export const saveChatProviderConfig = (config: StoredChatProviderConfig | null) => {
  if (!canUseStorage()) return
  if (!config) {
    safeRemoveItem(CHAT_PROVIDER_KEY)
    return
  }

  safeSetItem(CHAT_PROVIDER_KEY, JSON.stringify({
    ...config,
    systemPromptMode: normalizeSystemPromptMode(config.systemPromptMode),
  }))
}

export const loadPromptPresets = (): SavedPromptPreset[] => {
  if (!canUseStorage()) return []
  const raw = getStorageItem(PROMPT_PRESETS_KEY, LEGACY_PROMPT_PRESETS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as SavedPromptPreset[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const savePromptPresets = (presets: SavedPromptPreset[]) => {
  safeSetItem(PROMPT_PRESETS_KEY, JSON.stringify(presets))
}

export const upsertPromptPreset = (label: string, content: string): SavedPromptPreset[] => {
  const trimmedLabel = label.trim() || 'Untitled prompt'
  const now = new Date().toISOString()
  const presets = loadPromptPresets()
  const existing = presets.find((preset) => preset.label === trimmedLabel)

  const nextPresets = existing
    ? presets.map((preset) =>
        preset.id === existing.id
          ? { ...preset, content, updatedAt: now }
          : preset,
      )
    : [{ id: createId('prompt'), label: trimmedLabel, content, createdAt: now, updatedAt: now }, ...presets]

  savePromptPresets(nextPresets)
  return nextPresets
}

export function saveTutorialProgress(data: TutorialProgressData): void {
  if (!canUseStorage()) return

  safeSetItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(data))
}

export function loadTutorialProgress(): TutorialProgressData | null {
  if (!canUseStorage()) return null

  try {
    const raw = getStorageItem(
      TUTORIAL_PROGRESS_KEY,
      LEGACY_TUTORIAL_PROGRESS_KEY,
      LEGACY_TUTORIAL_PROGRESS_KEY_ALT,
    )
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' && parsed !== null &&
      'completedLessons' in parsed && Array.isArray((parsed as Record<string, unknown>).completedLessons)
    ) {
      return parsed as TutorialProgressData
    }
    return null
  } catch {
    return null
  }
}

export function clearTutorialProgress(): void {
  if (!canUseStorage()) return

  safeRemoveItem(TUTORIAL_PROGRESS_KEY)
  safeRemoveItem(LEGACY_TUTORIAL_PROGRESS_KEY)
  safeRemoveItem(LEGACY_TUTORIAL_PROGRESS_KEY_ALT)
}
