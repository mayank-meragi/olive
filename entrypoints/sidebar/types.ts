export type TabCtx = {
  id?: number
  title?: string
  url?: string
  favIconUrl?: string
}

export type TimelineKind = 'user' | 'ai' | 'thinking' | 'tool'

export type TimelineEntryBase = {
  id: string
  kind: TimelineKind
}

export type UserMessageEntry = TimelineEntryBase & {
  kind: 'user'
  text: string
  ctxTabs?: TabCtx[]
}

export type AiMessageEntry = TimelineEntryBase & {
  kind: 'ai'
  text: string
  toolEvents?: import('@/lib/genai').ToolEvent[]
}

export type ThinkingEntry = TimelineEntryBase & {
  kind: 'thinking'
  text: string
}

export type ToolTimelineEntry = TimelineEntryBase & {
  kind: 'tool'
  displayName?: string
  name: string
  args: any
  status: 'calling' | 'done'
  result?: any
  error?: string
}

export type ChatEntry =
  | UserMessageEntry
  | AiMessageEntry
  | ThinkingEntry
  | ToolTimelineEntry
