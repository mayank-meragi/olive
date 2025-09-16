import { Button } from "@/components/ui/button"
import { ArrowUp, Square } from "lucide-react"
import React from "react"

export function ChatInput({
  draft,
  setDraft,
  streaming,
  onSubmit,
  onStop,
  textareaRef,
  onAtTrigger,
}: {
  draft: string
  setDraft: (v: string) => void
  streaming: boolean
  onSubmit: () => void
  onStop: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onAtTrigger: () => void
}) {
  return (
    <div className="flex gap-2">
      <textarea
        ref={textareaRef}
        placeholder="Ask anything... Press @ to add tabs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "@") {
            e.preventDefault()
            onAtTrigger()
            return
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (!streaming) onSubmit()
          }
        }}
        rows={1}
        className="flex w-full min-h-[36px] max-h-40 
        resize-none overflow-y-auto rounded-md 
        bg-background px-3 py-1 text-sm 
        transition-colors 
        placeholder:text-muted-foreground 
        focus-visible:outline-none 
        focus-visible:ring-0 
        disabled:cursor-not-allowed disabled:opacity-50"
      />
      {streaming ? (
        <Button type="button" size="icon" onClick={onStop} title="Stop">
          <Square className="h-4 w-4" fill="white" />
        </Button>
      ) : (
        <Button type="button" size="icon" onClick={onSubmit} title="Send">
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
