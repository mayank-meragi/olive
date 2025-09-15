import { Type } from '@google/genai'
import type { ToolRegistry, ToolDefinition } from './genai'

function ensureHttpUrl(url: string): string | null {
  try {
    const u = new URL(String(url))
    if (!/^https?:$/.test(u.protocol)) return null
    return u.toString()
  } catch {
    return null
  }
}

function isValidId(id: unknown): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id >= 0
}

export function buildBrowserTools(opts: { autoRun: boolean }): ToolRegistry {
  const mustAllow = () => {
    if (!opts.autoRun) throw new Error('Tool execution disabled by user')
  }

  const openTab: ToolDefinition = {
    name: 'open_tab',
    description: 'Open a new browser tab to a given URL (http/https).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: 'Absolute URL to open (http/https).' },
      },
      required: ['url'],
    },
    handler: async ({ url }) => {
      mustAllow()
      const safe = ensureHttpUrl(String(url))
      if (!safe) return { ok: false, error: 'Invalid URL' }
      const tab = await browser.tabs.create({ url: safe })
      return { ok: true, url: safe, tabId: tab.id ?? null }
    },
  }

  const closeTab: ToolDefinition = {
    name: 'close_tab',
    description: 'Close a tab by id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'The id of the tab to close.' },
      },
      required: ['tabId'],
    },
    handler: async ({ tabId }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: 'Invalid tabId' }
      try {
        await browser.tabs.remove(tabId)
        return { ok: true, tabId }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    },
  }

  const switchTab: ToolDefinition = {
    name: 'switch_tab',
    description: 'Activate/focus a tab by id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'The id of the tab to activate.' },
      },
      required: ['tabId'],
    },
    handler: async ({ tabId }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: 'Invalid tabId' }
      try {
        const tab = await browser.tabs.update(tabId, { active: true })
        if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true })
        return { ok: true, tabId }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    },
  }

  const navigateTab: ToolDefinition = {
    name: 'navigate_tab',
    description: 'Navigate an existing tab to a new URL (http/https).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'The id of the tab to navigate.' },
        url: { type: Type.STRING, description: 'Absolute URL to navigate to (http/https).' },
      },
      required: ['tabId', 'url'],
    },
    handler: async ({ tabId, url }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: 'Invalid tabId' }
      const safe = ensureHttpUrl(String(url))
      if (!safe) return { ok: false, error: 'Invalid URL' }
      try {
        await browser.tabs.update(tabId, { url: safe })
        return { ok: true, tabId, url: safe }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    },
  }

  const reloadTab: ToolDefinition = {
    name: 'reload_tab',
    description: 'Reload an existing tab.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'The id of the tab to reload.' },
        bypassCache: { type: Type.BOOLEAN, description: 'If true, bypass the cache.' },
      },
      required: ['tabId'],
    },
    handler: async ({ tabId, bypassCache }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: 'Invalid tabId' }
      try {
        await browser.tabs.reload(tabId, { bypassCache: Boolean(bypassCache) })
        return { ok: true, tabId, bypassCache: Boolean(bypassCache) }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    },
  }

  const listTabs: ToolDefinition = {
    name: 'list_tabs',
    description: 'List open tabs with basic info (id, title, url, active, windowId, favIconUrl).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        currentWindow: { type: Type.BOOLEAN, description: 'If true, only list tabs in the current window.' },
      },
    },
    handler: async ({ currentWindow }) => {
      mustAllow()
      const query: any = {}
      if (Boolean(currentWindow)) query.currentWindow = true
      const tabs = await browser.tabs.query(query)
      const data = tabs.map((t) => ({
        id: t.id ?? null,
        title: t.title ?? '',
        url: t.url ?? '',
        active: !!t.active,
        windowId: t.windowId ?? null,
        favIconUrl: t.favIconUrl ?? undefined,
      }))
      return { ok: true, count: data.length, tabs: data }
    },
  }

  // Helper to run a function in a tab context
  async function runInTab<T = any>(tabId: number, fn: (...args: any[]) => T | Promise<T>, args: any[] = []): Promise<T> {
    // MV3 Chromium: browser.scripting.executeScript
    // MV2/Firefox: browser.tabs.executeScript
    try {
      const anyBrowser: any = browser as any
      if (anyBrowser?.scripting?.executeScript) {
        const res = await anyBrowser.scripting.executeScript({ target: { tabId }, func: fn, args })
        // Chrome returns an array of results (one per frame); pick first
        return res?.[0]?.result as T
      }
    } catch (e) {
      // fall through to tabs.executeScript
    }
    // Fallback to tabs.executeScript with robust code serialization
    const argsCode = args
      .map((a) => (a === undefined ? 'undefined' : JSON.stringify(a)))
      .join(', ')
    const code = `(${fn.toString()})(${argsCode})`
    const results = await (browser.tabs as any).executeScript(tabId, { code })
    return Array.isArray(results) ? (results[0] as T) : (results as T)
  }

  const getPageContent: ToolDefinition = {
    name: 'get_page_content',
    description: 'Get text or HTML content of the page or a specific element.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'Tab id. If omitted, uses active tab.' },
        selector: { type: Type.STRING, description: 'Optional CSS selector to scope the content.' },
        html: { type: Type.BOOLEAN, description: 'If true, return HTML instead of text.' },
        maxLen: { type: Type.INTEGER, description: 'Optional max length of returned content.' },
      },
    },
    handler: async ({ tabId, selector, html = false, maxLen }) => {
      mustAllow()
      let tid: number | undefined = tabId
      if (!isValidId(tid)) {
        const [active] = await browser.tabs.query({ active: true, currentWindow: true })
        tid = active?.id ?? undefined
      }
      if (!isValidId(tid)) return { ok: false, error: 'No valid tabId' }
      const res = await runInTab(tid, (sel?: string, asHtml?: boolean, cap?: number) => {
        const root = sel ? document.querySelector(sel) : document.documentElement
        if (!root) return { ok: false, error: 'Selector not found' }
        const content = asHtml ? (root as HTMLElement).outerHTML : (root as HTMLElement).innerText
        const out = typeof cap === 'number' && cap > 0 ? content.slice(0, cap) : content
        return { ok: true, content: out, length: content.length }
      }, [selector ?? undefined, Boolean(html), typeof maxLen === 'number' ? maxLen : undefined])
      return res
    },
  }

  const fillFormField: ToolDefinition = {
    name: 'fill_form_field',
    description: 'Fill an input/textarea/contenteditable field by CSS selector.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'Tab id to run in.' },
        selector: { type: Type.STRING, description: 'CSS selector for the field.' },
        value: { type: Type.STRING, description: 'Text value to fill.' },
      },
      required: ['tabId', 'selector', 'value'],
    },
    handler: async ({ tabId, selector, value }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: 'Invalid tabId' }
      const res = await runInTab(tabId, (sel: string, val: string) => {
        const el = document.querySelector(sel) as any
        if (!el) return { ok: false, error: 'Selector not found' }
        const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        const isCE = !isInput && el && typeof el.isContentEditable === 'boolean' && el.isContentEditable
        if (isInput) {
          el.focus()
          el.value = val
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          return { ok: true }
        } else if (isCE) {
          el.focus()
          el.textContent = val
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          return { ok: true }
        }
        return { ok: false, error: 'Element is not fillable' }
      }, [String(selector), String(value)])
      return res
    },
  }

  const clickElement: ToolDefinition = {
    name: 'click_element',
    description: 'Click a button/link or any clickable element by CSS selector.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'Tab id to run in.' },
        selector: { type: Type.STRING, description: 'CSS selector for the element.' },
      },
      required: ['tabId', 'selector'],
    },
    handler: async ({ tabId, selector }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: 'Invalid tabId' }
      const res = await runInTab(tabId, (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null
        if (!el) return { ok: false, error: 'Selector not found' }
        el.focus()
        el.click()
        return { ok: true }
      }, [String(selector)])
      return res
    },
  }

  const scrollPage: ToolDefinition = {
    name: 'scroll',
    description: 'Scroll the window or a specific element to load more content.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'Tab id to run in.' },
        selector: { type: Type.STRING, description: 'Optional CSS selector to scroll inside.' },
        to: { type: Type.STRING, description: "Target position: 'top' | 'bottom'" },
        deltaY: { type: Type.INTEGER, description: 'Pixels to scroll by vertically (if provided).' },
        behavior: { type: Type.STRING, description: "Scroll behavior: 'auto' | 'smooth'" },
      },
      required: ['tabId'],
    },
    handler: async ({ tabId, selector, to, deltaY, behavior }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: 'Invalid tabId' }
      const res = await runInTab(tabId, (sel?: string, toPos?: string, dY?: number, beh?: ScrollBehavior) => {
        const target: any = sel ? document.querySelector(sel) : window
        if (sel && !target) return { ok: false, error: 'Selector not found' }
        const scrollOpts = { behavior: (beh as any) || 'auto' }
        if (toPos === 'top') {
          if (target === window) (window as any).scrollTo({ top: 0, ...(scrollOpts as any) })
          else (target as HTMLElement).scrollTo({ top: 0, ...(scrollOpts as any) })
          return { ok: true }
        }
        if (toPos === 'bottom') {
          if (target === window) (window as any).scrollTo({ top: document.body.scrollHeight, ...(scrollOpts as any) })
          else (target as HTMLElement).scrollTo({ top: (target as HTMLElement).scrollHeight, ...(scrollOpts as any) })
          return { ok: true }
        }
        const amount = typeof dY === 'number' ? dY : 600
        if (target === window) (window as any).scrollBy({ top: amount, ...(scrollOpts as any) })
        else (target as HTMLElement).scrollBy({ top: amount, ...(scrollOpts as any) })
        return { ok: true }
      }, [selector ?? undefined, to ?? undefined, typeof deltaY === 'number' ? deltaY : undefined, behavior ?? undefined])
      return res
    },
  }

  return {
    [openTab.name]: openTab,
    [closeTab.name]: closeTab,
    [switchTab.name]: switchTab,
    [navigateTab.name]: navigateTab,
    [reloadTab.name]: reloadTab,
    [listTabs.name]: listTabs,
    [getPageContent.name]: getPageContent,
    [fillFormField.name]: fillFormField,
    [clickElement.name]: clickElement,
    [scrollPage.name]: scrollPage,
  }
}
