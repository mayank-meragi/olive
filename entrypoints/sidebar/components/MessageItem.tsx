import { Button } from "@/components/ui/button"
import { LucidePen } from "lucide-react"
import { useState } from "react"
import { useChatControllerContext } from "../context/ChatControllerContext"
import type { AiMessageEntry, UserMessageEntry } from "../types"
import { MarkdownRenderer } from "./MarkdownRenderer"

export function MessageItem({
  entry,
}: {
  entry: AiMessageEntry | UserMessageEntry
}) {
  const isUser = entry.kind === "user"
  const { streaming, editAndResendUserMessage } = useChatControllerContext()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(() =>
    isUser ? (entry as UserMessageEntry).text : ""
  )
  return (
    <div className={isUser ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
      <div
        className={
          isUser
            ? "rounded-md bg-primary px-3 py-2 text-primary-foreground select-text"
            : "rounded-md bg-muted px-3 py-2 text-foreground select-text"
        }
      >
        {isUser && editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="w-full resize-none rounded border bg-background px-2 py-1 text-foreground"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={streaming}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  editAndResendUserMessage(entry.id, text)
                }}
                disabled={streaming || !text.trim()}
              >
                Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  setText((entry as UserMessageEntry).text)
                }}
                disabled={streaming}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative">
            {isUser && !editing && (
              <div className="absolute right-0 top-0">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(true)}
                  disabled={streaming}
                >
                  <LucidePen size={10} className="text-muted-foreground" />
                </Button>
              </div>
            )}
            <MarkdownRenderer>{entry.text}</MarkdownRenderer>
          </div>
        )}
      </div>
      {isUser && Array.isArray(entry.ctxTabs) && entry.ctxTabs.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {entry.ctxTabs.map((t, idx) => (
            <div
              key={(t.id ?? idx) + (t.url ?? "")}
              className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs"
            >
              {t.favIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.favIconUrl} alt="" className="h-3 w-3" />
              ) : (
                <div className="h-3 w-3 rounded-sm bg-background" />
              )}
              <span className="max-w-[200px] truncate">
                {t.title ?? "Untitled"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
