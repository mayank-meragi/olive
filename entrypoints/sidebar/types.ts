export type TabCtx = {
  id?: number
  title?: string
  url?: string
  favIconUrl?: string
}

export type Role = 'user' | 'ai'

export type LiveToolEvent = {
  name: string
  args: any
  status: 'calling' | 'done'
  result?: any
  error?: string
}

export type ChatMessage = {
  role: Role
  text: string
  thinking?: string
  ctxTabs?: TabCtx[]
  // During streaming we keep live tool events separate for UI
  toolEventsLive?: LiveToolEvent[]
  // Finalized tool events after completion
  toolEvents?: import('@/lib/genai').ToolEvent[]
}

