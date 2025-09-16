import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ThinkingEntry } from "../types"
import { MarkdownRenderer } from "./MarkdownRenderer"

export function ThinkingItem({ entry }: { entry: ThinkingEntry }) {
  if (!entry.text) return null
  return (
    <div className="mr-auto max-w-[80%]">
      <div className="mb-1">
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="text-xs text-muted-foreground">
            Thinking
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 rounded-md border bg-background p-2 text-sm">
              <MarkdownRenderer>{entry.text}</MarkdownRenderer>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
