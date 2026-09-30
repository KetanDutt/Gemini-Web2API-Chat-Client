export type Role = 'system' | 'user' | 'assistant'

export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error' | 'stopped'

export interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface Attachment {
  id: string
  name: string
  mimeType: string
  size: number
  /** data: URL – only present when the backend supports image input */
  dataUrl?: string
}

/** A single alternative response (used for regenerate versions). */
export interface MessageVersion {
  id: string
  content: string
  createdAt: number
  model?: string
  usage?: Usage
  latencyMs?: number
  status: MessageStatus
  error?: string
  finishReason?: string
}

export interface Message {
  id: string
  conversationId: string
  role: Role
  content: string
  createdAt: number
  updatedAt?: number
  model?: string
  usage?: Usage
  latencyMs?: number
  status: MessageStatus
  error?: string
  /** Ordinal position inside the conversation. */
  order: number
  /** Alternative responses produced by "Regenerate". */
  versions?: MessageVersion[]
  /** Index of the currently displayed version, when versions exist. */
  activeVersion?: number
  attachments?: Attachment[]
  /** OpenAI finish_reason of the active version ('stop' | 'length' | …). */
  finishReason?: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  model: string
  favorite: boolean
  archived: boolean
  pinned?: boolean
  systemPrompt?: string
  /** Cached preview of the last message. */
  preview?: string
  messageCount?: number
  titleEdited?: boolean
}

export type PromptCategory = 'Coding' | 'Writing' | 'Research' | 'Business' | 'Learning' | 'Personal'

export interface SavedPrompt {
  id: string
  name: string
  description?: string
  text: string
  category: PromptCategory
  favorite: boolean
  createdAt: number
  updatedAt: number
}

export interface ModelInfo {
  id: string
  label: string
  ownedBy?: string
  created?: number
}

export interface ChatParams {
  temperature?: number
  top_p?: number
  max_tokens?: number
}

export type ConnectionState = 'idle' | 'checking' | 'connected' | 'offline' | 'error'

export type ThemeMode = 'system' | 'light' | 'dark'
export type Density = 'compact' | 'comfortable' | 'spacious'

export type ExportFormat = 'json' | 'markdown' | 'txt'

export interface GlassGemExportConversation {
  conversation: Conversation
  messages: Message[]
}

export interface GlassGemExport {
  app: 'GlassGem'
  version: 1
  exportedAt: string
  conversations: GlassGemExportConversation[]
  prompts?: SavedPrompt[]
}
