import { useChatController } from './hooks/useChatController'
import { MessageList } from './components/MessageList'
import { ChatComposer } from './components/ChatComposer'

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
  } = useChatController()

  return (
    <div className="flex h-screen w-full flex-col">
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
  )
}
