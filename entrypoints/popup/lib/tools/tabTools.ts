import { Type } from "@google/genai"
import type { ToolDefinition } from "../genai"
import type { MustAllowFn } from "./types"
import { ensureHttpUrl, isValidId } from "./utils"

export function createTabTools({
  mustAllow,
}: {
  mustAllow: MustAllowFn
}): Record<string, ToolDefinition> {
  const openTab: ToolDefinition = {
    name: "open_tab",
    displayName: "Open Tab",
    description: "Open a new browser tab to a given URL (http/https).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: "Absolute URL to open (http/https).",
        },
      },
      required: ["url"],
    },
    handler: async ({ url }) => {
      mustAllow()
      const safe = ensureHttpUrl(String(url))
      if (!safe) return { ok: false, error: "Invalid URL" }
      const tab = await browser.tabs.create({ url: safe })
      return { ok: true, url: safe, tabId: tab.id ?? null }
    },
  }

  const closeTab: ToolDefinition = {
    name: "close_tab",
    displayName: "Close Tab",
    description: "Close a tab by id.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: {
          type: Type.INTEGER,
          description: "The id of the tab to close.",
        },
      },
      required: ["tabId"],
    },
    handler: async ({ tabId }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      try {
        await browser.tabs.remove(tabId)
        return { ok: true, tabId }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    },
  }

  const switchTab: ToolDefinition = {
    name: "switch_tab",
    displayName: "Switch Tab",
    description: "Activate/focus a tab by id.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: {
          type: Type.INTEGER,
          description: "The id of the tab to activate.",
        },
      },
      required: ["tabId"],
    },
    handler: async ({ tabId }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      try {
        const tab = await browser.tabs.update(tabId, { active: true })
        if (tab?.windowId != null)
          await browser.windows.update(tab.windowId, { focused: true })
        return { ok: true, tabId }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    },
  }

  const navigateTab: ToolDefinition = {
    name: "navigate_tab",
    displayName: "Navigate Tab",
    description: "Navigate an existing tab to a new URL (http/https).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: {
          type: Type.INTEGER,
          description: "The id of the tab to navigate.",
        },
        url: {
          type: Type.STRING,
          description: "Absolute URL to navigate to (http/https).",
        },
      },
      required: ["tabId", "url"],
    },
    handler: async ({ tabId, url }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      const safe = ensureHttpUrl(String(url))
      if (!safe) return { ok: false, error: "Invalid URL" }
      try {
        await browser.tabs.update(tabId, { url: safe })
        return { ok: true, tabId, url: safe }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    },
  }

  const reloadTab: ToolDefinition = {
    name: "reload_tab",
    displayName: "Reload Tab",
    description: "Reload an existing tab.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: {
          type: Type.INTEGER,
          description: "The id of the tab to reload.",
        },
        bypassCache: {
          type: Type.BOOLEAN,
          description: "If true, bypass the cache.",
        },
      },
      required: ["tabId"],
    },
    handler: async ({ tabId, bypassCache }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      try {
        await browser.tabs.reload(tabId, { bypassCache: Boolean(bypassCache) })
        return { ok: true, tabId, bypassCache: Boolean(bypassCache) }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    },
  }

  const listTabs: ToolDefinition = {
    name: "list_tabs",
    displayName: "List Tabs",
    description:
      "List open tabs with basic info (id, title, url, active, windowId, favIconUrl).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        currentWindow: {
          type: Type.BOOLEAN,
          description: "If true, only list tabs in the current window.",
        },
      },
    },
    handler: async ({ currentWindow }) => {
      mustAllow()
      const query: any = {}
      if (Boolean(currentWindow)) query.currentWindow = true
      const tabs = await browser.tabs.query(query)
      const data = tabs.map((t) => ({
        id: t.id ?? null,
        title: t.title ?? "",
        url: t.url ?? "",
        active: !!t.active,
        windowId: t.windowId ?? null,
        favIconUrl: t.favIconUrl ?? undefined,
      }))
      return { ok: true, count: data.length, tabs: data }
    },
  }

  return {
    [openTab.name]: openTab,
    [closeTab.name]: closeTab,
    [switchTab.name]: switchTab,
    [navigateTab.name]: navigateTab,
    [reloadTab.name]: reloadTab,
    [listTabs.name]: listTabs,
  }
}
