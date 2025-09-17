import { createContext, useContext } from 'react'
import type { PropsWithChildren } from 'react'
import { useChatController } from '../hooks/useChatController'

const ChatControllerContext = createContext<ReturnType<typeof useChatController> | null>(null)

export function ChatControllerProvider({ children }: PropsWithChildren) {
  const value = useChatController()
  return (
    <ChatControllerContext.Provider value={value}>
      {children}
    </ChatControllerContext.Provider>
  )
}

export function useChatControllerContext() {
  const ctx = useContext(ChatControllerContext)
  if (!ctx) {
    throw new Error('useChatControllerContext must be used within ChatControllerProvider')
  }
  return ctx
}
