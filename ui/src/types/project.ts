export const DEFAULT_CHAT_MODEL = 'deepseek/deepseek-v4.1-flash'
export const DEFAULT_SYSTEM_PROMPT_MODE = 'shoedelussy'

export type ChatModel = string
// Keep the legacy 'strudelussy' mode value readable so old localStorage config still loads.
export type SystemPromptMode = 'legacy-toaster' | 'shoedelussy' | 'strudelussy'
export type CustomSystemPrompt = string

export interface SavedPromptPreset {
  id: string
  label: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface CodeDiff {
  before: string
  after: string
  summary: string
}

export interface CodeVersion {
  id: string
  code: string
  label?: string
  created_at: string
  created_by: 'user' | 'ai'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  code_diff?: CodeDiff
  status?: 'pending' | 'applied' | 'rejected' | 'error'
  isPreviewing?: boolean
  timestamp: string
}

export interface LightingSectionBinding {
  section_label: string
  scene_id: string
}

export interface LightingTrackBinding {
  track_name: string
  group_id: string
  intensity?: number
  hold_ms?: number
  fade_ms?: number
}

export interface LightingProjectState {
  cue_bindings: LightingSectionBinding[]
  group_bindings: LightingTrackBinding[]
}

export interface Project {
  id: string
  user_id: string
  name: string
  description?: string
  strudel_code: string
  chat_history: ChatMessage[]
  versions: CodeVersion[]
  lighting?: LightingProjectState
  bpm?: number
  key?: string
  tags: string[]
  is_public?: boolean
  created_at: string
  updated_at: string
}

export interface ProjectSummary {
  id: string
  name: string
  bpm?: number
  key?: string
  tags: string[]
  updated_at: string
}

export interface SectionMarker {
  label: string
  line: number
}

export interface ExtractedParam {
  id: string
  label: string
  value: number
  min: number
  max: number
  kind: 'gain' | 'speed' | 'room' | 'cps'
  expression: string
  valueStart: number
  valueEnd: number
}

export interface AIResponse {
  message: string
  code: string
  diff_summary: string
  has_code_change: boolean
}

export interface ChatStreamErrorInfo {
  message: string
  status?: number
  retryAfter?: number
  isRetryable?: boolean
}
