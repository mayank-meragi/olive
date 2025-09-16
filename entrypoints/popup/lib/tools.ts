import { Type } from '@google/genai'
import type { ToolRegistry, ToolDefinition } from './genai'

export type TaskCreationInput = {
  title: string
  parentTaskId?: string
  completed?: boolean
}

export type TaskDeletionInput = {
  taskId: string
  parentTaskId?: string
}

export type TaskCompletionInput = {
  taskId: string
  parentTaskId?: string
  done?: boolean
}

export type TaskToolClient = {
  createTask: (input: TaskCreationInput) => Promise<any>
  deleteTask: (input: TaskDeletionInput) => Promise<any>
  markTaskDone: (input: TaskCompletionInput) => Promise<any>
}

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

export function buildBrowserTools(opts: {
  autoRun: boolean
  taskClient?: TaskToolClient
}): ToolRegistry {
  const mustAllow = () => {
    if (!opts.autoRun) throw new Error('Tool execution disabled by user')
  }

  const openTab: ToolDefinition = {
    name: 'open_tab',
    displayName: 'Open Tab',
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
    displayName: 'Close Tab',
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
    displayName: 'Switch Tab',
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
    displayName: 'Navigate Tab',
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
    displayName: 'Reload Tab',
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
    displayName: 'List Tabs',
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
    const code = `(
      async () => {
        const fn = ${fn.toString()};
        return await fn(${argsCode});
      }
    )()`
    const results = await (browser.tabs as any).executeScript(tabId, { code })
    return Array.isArray(results) ? (results[0] as T) : (results as T)
  }

  const getPageContent: ToolDefinition = {
    name: 'get_page_content',
    displayName: 'Get Page Content',
    description: 'Get text or HTML content of the page or a specific element, optionally waiting for dynamic content.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: 'Tab id. If omitted, uses active tab.' },
        selector: { type: Type.STRING, description: 'Optional CSS selector to scope the content.' },
        waitForSelector: { type: Type.STRING, description: 'Wait until this selector is found before reading content.' },
        waitForSelectorTimeoutMs: { type: Type.INTEGER, description: 'Max milliseconds to wait for waitForSelector before giving up (default 8000).' },
        waitMs: { type: Type.INTEGER, description: 'Additional milliseconds to wait before capturing content.' },
        html: { type: Type.BOOLEAN, description: 'If true, return HTML instead of text.' },
        maxLen: { type: Type.INTEGER, description: 'Optional max length of returned content.' },
      },
    },
    handler: async ({
      tabId,
      selector,
      waitForSelector,
      waitForSelectorTimeoutMs,
      waitMs,
      html = false,
      maxLen,
    }) => {
      mustAllow()
      let tid: number | undefined = tabId
      if (!isValidId(tid)) {
        const [active] = await browser.tabs.query({ active: true, currentWindow: true })
        tid = active?.id ?? undefined
      }
      if (!isValidId(tid)) return { ok: false, error: 'No valid tabId' }
      const res = await runInTab(
        tid,
        async (
          sel?: string,
          asHtml?: boolean,
          cap?: number,
          waitSel?: string,
          waitSelTimeoutMs?: number,
          waitExtraMs?: number
        ) => {
          const sleep = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))

          if (typeof waitExtraMs === 'number' && waitExtraMs > 0) {
            await sleep(waitExtraMs)
          }

          if (waitSel) {
            const timeout = typeof waitSelTimeoutMs === 'number' && waitSelTimeoutMs > 0 ? waitSelTimeoutMs : 8000
            const start = Date.now()
            let found: Element | null = null
            while (Date.now() - start < timeout) {
              found = document.querySelector(waitSel)
              if (found) break
              await sleep(100)
            }
            if (!found) {
              return { ok: false, error: 'waitForSelector timeout' }
            }
          }

          const root = sel ? document.querySelector(sel) : document.documentElement
          if (!root) return { ok: false, error: 'Selector not found' }
          const content = asHtml
            ? (root as HTMLElement).outerHTML
            : (root as HTMLElement).innerText
          const out = typeof cap === 'number' && cap > 0 ? content.slice(0, cap) : content
          return { ok: true, content: out, length: content.length }
        },
        [
          selector ?? undefined,
          Boolean(html),
          typeof maxLen === 'number' ? maxLen : undefined,
          waitForSelector ?? undefined,
          typeof waitForSelectorTimeoutMs === 'number' ? waitForSelectorTimeoutMs : undefined,
          typeof waitMs === 'number' ? waitMs : undefined,
        ]
      )
      return res
    },
  }

  const fillFormField: ToolDefinition = {
    name: 'fill_form_field',
    displayName: 'Fill Form Field',
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
    displayName: 'Click Element',
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
    displayName: 'Scroll',
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

  let createTaskTool: ToolDefinition | null = null
  let deleteTaskTool: ToolDefinition | null = null
  let markTaskDoneTool: ToolDefinition | null = null

  if (opts.taskClient) {
    const taskClient = opts.taskClient
    createTaskTool = {
      name: 'create_task',
      displayName: 'Create Task',
      description:
        'Create a task or subtask in the active Olive conversation. Provide parentTaskId to create a subtask.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Short description of the task or subtask.',
          },
          parentTaskId: {
            type: Type.STRING,
            description: 'Optional id of the parent task when creating a subtask.',
          },
          completed: {
            type: Type.BOOLEAN,
            description: 'Set true to immediately mark the task/subtask as done.',
          },
        },
        required: ['title'],
      },
      handler: async ({ title, parentTaskId, completed }) => {
        mustAllow()
        return await taskClient.createTask({
          title: String(title ?? ''),
          parentTaskId: typeof parentTaskId === 'string' ? parentTaskId : undefined,
          completed: typeof completed === 'boolean' ? completed : undefined,
        })
      },
    }

    deleteTaskTool = {
      name: 'delete_task',
      displayName: 'Delete Task',
      description: 'Delete a task or subtask by id in the active conversation.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskId: {
            type: Type.STRING,
            description: 'Id of the task or subtask to delete.',
          },
          parentTaskId: {
            type: Type.STRING,
            description: 'If deleting a subtask, provide the parent task id.',
          },
        },
        required: ['taskId'],
      },
      handler: async ({ taskId, parentTaskId }) => {
        mustAllow()
        return await taskClient.deleteTask({
          taskId: String(taskId ?? ''),
          parentTaskId: typeof parentTaskId === 'string' ? parentTaskId : undefined,
        })
      },
    }

    markTaskDoneTool = {
      name: 'mark_task_done',
      displayName: 'Mark Task Done',
      description:
        'Mark a task or subtask complete/incomplete. Provide done=false to reopen the task.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskId: {
            type: Type.STRING,
            description: 'Id of the task or subtask to update.',
          },
          parentTaskId: {
            type: Type.STRING,
            description: 'If updating a subtask, provide the parent task id.',
          },
          done: {
            type: Type.BOOLEAN,
            description: 'Set to true for done, false for not done. Omit to toggle.',
          },
        },
        required: ['taskId'],
      },
      handler: async ({ taskId, parentTaskId, done }) => {
        mustAllow()
        return await taskClient.markTaskDone({
          taskId: String(taskId ?? ''),
          parentTaskId: typeof parentTaskId === 'string' ? parentTaskId : undefined,
          done: typeof done === 'boolean' ? done : undefined,
        })
      },
    }
  }

  const registry: ToolRegistry = {
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

  if (createTaskTool && deleteTaskTool && markTaskDoneTool) {
    registry[createTaskTool.name] = createTaskTool
    registry[deleteTaskTool.name] = deleteTaskTool
    registry[markTaskDoneTool.name] = markTaskDoneTool
  }

  return registry
}
