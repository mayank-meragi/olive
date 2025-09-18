import { Button } from "@/components/ui/button"
import { History, Plus, Trash } from "lucide-react"
import { useState } from "react"
import { ChatComposer } from "./components/ChatComposer"
import { MessageList } from "./components/MessageList"
import { TasksPanel } from "./components/TasksPanel"
import { ChatControllerProvider, useChatControllerContext } from "./context/ChatControllerContext"

function formatConversationTime(timestamp?: number) {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }
  return date.toLocaleDateString()
}

export default function Sidebar() {
  return (
    <ChatControllerProvider>
      <SidebarContent />
    </ChatControllerProvider>
  )
}

function SidebarContent() {
  const {
    listRef,
    streaming,
    conversations,
    activeConversationId,
    selectConversation,
    deleteConversation,
    startNewConversation,
    conversationsReady,
    tasks,
  } = useChatControllerContext()
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium">Olive — AI Sidebar</div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              startNewConversation()
              setHistoryOpen(false)
            }}
            variant="outline"
            size="icon"
            disabled={!conversationsReady || streaming}
            aria-label="Start new chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => setHistoryOpen((prev) => !prev)}
            variant={historyOpen ? "default" : "outline"}
            size="icon"
            aria-pressed={historyOpen}
            aria-label="Toggle history"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {historyOpen ? (
        <div className="flex-1 overflow-auto px-3 py-2">
          {!conversationsReady ? (
            <div className="py-4 text-sm text-muted-foreground">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="py-4 text-sm text-muted-foreground">
              Start a new chat to see it here.
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId
                return (
                  <div key={conversation.id} className="flex items-center gap-1">
                    <Button
                      onClick={() => {
                        selectConversation(conversation.id)
                        setHistoryOpen(false)
                      }}
                      disabled={streaming}
                      variant={isActive ? "default" : "ghost"}
                      className={`flex h-auto w-full flex-1 flex-col items-start gap-1 px-3 py-2 text-left text-xs ${
                        isActive
                          ? "text-background"
                          : "text-muted-foreground hover:text-foreground"
                      } ${streaming ? "pointer-events-none opacity-60" : ""}`}
                    >
                      <span className="w-full truncate text-sm font-medium">
                        {conversation.title || "New Chat"}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wide ${
                          isActive
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatConversationTime(conversation.updatedAt)}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      disabled={streaming}
                      aria-label="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteConversation(conversation.id)
                      }}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex-1 space-y-2 overflow-auto p-3">
            <MessageList />
          </div>
          {tasks.length > 0 && <TasksPanel />}
          <ChatComposer />
        </>
      )}
    </div>
  )
}
