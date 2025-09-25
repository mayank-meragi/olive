import type { SavedCommand } from "../types"

export const DEFAULT_SAVED_COMMANDS: SavedCommand[] = [
  {
    id: "cmd-summarize-current-tab",
    name: "Summarize Current Tab",
    type: "Summary",
    text: `Summarize the current page in 5-7 bullet points with a one-sentence TL;DR at 
      the top. Highlight key facts, decisions, and any action items.`,
  },
  {
    id: "cmd-group-tabs-by-topic",
    name: "Group Tabs by Topic",
    type: "Organize",
    text: `Review my open tabs and group them by topic. Output headings for each topic with 
      the tab titles as bullets. Suggest redundant tabs to close and a minimal set to 
      keep open.`,
  },
]
