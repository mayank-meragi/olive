import { useChatController } from './hooks/useChatController'
import { MessageList } from './components/MessageList'
import { ChatComposer } from './components/ChatComposer'

function formatConversationTime(timestamp?: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString()
}

export default function Sidebar() {
  const {
    messages,
    draft,
    setDraft,
    listRef,
    textareaRef,
    streaming,
    model,
    setModel,
    thinking,
    setThinking,
    autoRunTools,
    setAutoRunTools,
    tabPickerOpen,
    setTabPickerOpen,
    allTabs,
    setAllTabs,
    selectedTabIds,
    toggleTabSelection,
    removeSelectedTab,
    handleSubmit,
    handleStop,
    conversations,
    activeConversationId,
    selectConversation,
    startNewConversation,
    conversationsReady,
  } = useChatController()

  return (
    <div className="flex h-screen w-full">
      <aside className="flex w-56 flex-col border-r bg-muted/30">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            History
          </span>
          <button
            type="button"
            onClick={startNewConversation}
            className="rounded bg-background px-2 py-1 text-xs font-medium text-foreground shadow-sm transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!conversationsReady || streaming}
          >
            New
          </button>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {!conversationsReady ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Start a new chat to see it here.
            </div>
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId
              return (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => selectConversation(conversation.id)}
                  disabled={streaming}
                  className={`flex w-full flex-col items-start gap-1 px-3 py-2 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  } ${streaming ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <span className="w-full truncate text-sm font-medium">
                    {conversation.title || 'New Chat'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {formatConversationTime(conversation.updatedAt)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-medium">Olive — AI Sidebar</div>
        </div>
        <div ref={listRef} className="flex-1 space-y-2 overflow-auto p-3">
          <MessageList messages={messages} />
        </div>
        <ChatComposer
          draft={draft}
          onDraftChange={(value) => setDraft(value)}
          streaming={streaming}
          onSubmit={handleSubmit}
          onStop={handleStop}
          textareaRef={textareaRef}
          tabPickerOpen={tabPickerOpen}
          onTabPickerOpenChange={(open) => setTabPickerOpen(open)}
          allTabs={allTabs}
          setAllTabs={setAllTabs}
          selectedTabIds={selectedTabIds}
          onToggleTab={toggleTabSelection}
          onRemoveTab={removeSelectedTab}
          model={model}
          onModelChange={(value) => setModel(value)}
          thinking={thinking}
          onThinkingToggle={(value) => setThinking(value)}
          autoRunTools={autoRunTools}
          onAutoRunToolsToggle={(value) => setAutoRunTools(value)}
        />
      </div>
    </div>
  )
}
