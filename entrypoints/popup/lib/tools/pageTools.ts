import { Type } from "@google/genai"
import type { ToolDefinition } from "../genai"
import type { MustAllowFn } from "./types"
import { isValidId, runInTab } from "./utils"

export function createPageTools({
  mustAllow,
}: {
  mustAllow: MustAllowFn
}): Record<string, ToolDefinition> {
  const getPageContent: ToolDefinition = {
    name: "get_page_content",
    displayName: "Get Page Content",
    description:
      "Get text or HTML content of the page or a specific element, optionally waiting for dynamic content.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: {
          type: Type.INTEGER,
          description: "Tab id. If omitted, uses active tab.",
        },
        selector: {
          type: Type.STRING,
          description: "Optional CSS selector to scope the content.",
        },
        waitForSelector: {
          type: Type.STRING,
          description:
            "Wait until this selector is found before reading content.",
        },
        waitForSelectorTimeoutMs: {
          type: Type.INTEGER,
          description:
            "Max milliseconds to wait for waitForSelector before giving up (default 8000).",
        },
        waitMs: {
          type: Type.INTEGER,
          description:
            "Additional milliseconds to wait before capturing content.",
        },
        html: {
          type: Type.BOOLEAN,
          description: "If true, return HTML instead of text.",
        },
        maxLen: {
          type: Type.INTEGER,
          description: "Optional max length of returned content.",
        },
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
        const [active] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        })
        tid = active?.id ?? undefined
      }
      if (!isValidId(tid)) return { ok: false, error: "No valid tabId" }
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

          if (typeof waitExtraMs === "number" && waitExtraMs > 0) {
            await sleep(waitExtraMs)
          }

          if (waitSel) {
            const timeout =
              typeof waitSelTimeoutMs === "number" && waitSelTimeoutMs > 0
                ? waitSelTimeoutMs
                : 8000
            const start = Date.now()
            let found: Element | null = null
            while (Date.now() - start < timeout) {
              found = document.querySelector(waitSel)
              if (found) break
              await sleep(100)
            }
            if (!found) {
              return { ok: false, error: "waitForSelector timeout" }
            }
          }

          const root = sel
            ? document.querySelector(sel)
            : document.documentElement
          if (!root) return { ok: false, error: "Selector not found" }
          const content = asHtml
            ? (root as HTMLElement).outerHTML
            : (root as HTMLElement).innerText
          const out =
            typeof cap === "number" && cap > 0 ? content.slice(0, cap) : content
          return { ok: true, content: out, length: content.length }
        },
        [
          selector ?? undefined,
          Boolean(html),
          typeof maxLen === "number" ? maxLen : undefined,
          waitForSelector ?? undefined,
          typeof waitForSelectorTimeoutMs === "number"
            ? waitForSelectorTimeoutMs
            : undefined,
          typeof waitMs === "number" ? waitMs : undefined,
        ]
      )
      return res
    },
  }

  const fillFormField: ToolDefinition = {
    name: "fill_form_field",
    displayName: "Fill Form Field",
    description:
      "Fill an input/textarea/contenteditable field by CSS selector.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: "Tab id to run in." },
        selector: {
          type: Type.STRING,
          description: "CSS selector for the field.",
        },
        value: { type: Type.STRING, description: "Text value to fill." },
      },
      required: ["tabId", "selector", "value"],
    },
    handler: async ({ tabId, selector, value }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      const res = await runInTab(
        tabId,
        (sel: string, val: string) => {
          const el = document.querySelector(sel) as any
          console.log("FILL selector", sel)
          if (!el) return { ok: false, error: "Selector not found" }
          const isInput =
            el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          const isCE =
            !isInput &&
            el &&
            typeof el.isContentEditable === "boolean" &&
            el.isContentEditable
          if (isInput) {
            el.focus()
            el.value = val
            el.dispatchEvent(new Event("input", { bubbles: true }))
            el.dispatchEvent(new Event("change", { bubbles: true }))
            return { ok: true }
          } else if (isCE) {
            el.focus()
            el.textContent = val
            el.dispatchEvent(new Event("input", { bubbles: true }))
            el.dispatchEvent(new Event("change", { bubbles: true }))
            return { ok: true }
          }
          return { ok: false, error: "Element is not fillable" }
        },
        [String(selector), String(value)]
      )
      return res
    },
  }

  const clickElement: ToolDefinition = {
    name: "click_element",
    displayName: "Click Element",
    description:
      "Click a button/link or any clickable element by CSS selector.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: "Tab id to run in." },
        selector: {
          type: Type.STRING,
          description: "CSS selector for the element.",
        },
      },
      required: ["tabId", "selector"],
    },
    handler: async ({ tabId, selector }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      const res = await runInTab(
        tabId,
        (sel: string) => {
          const el = document.querySelector(sel) as HTMLElement | null
          console.log("CLICK selector", sel)
          if (!el) return { ok: false, error: "Selector not found" }
          el.focus()
          el.click()
          return { ok: true }
        },
        [String(selector)]
      )
      return res
    },
  }

  const scrollPage: ToolDefinition = {
    name: "scroll",
    displayName: "Scroll",
    description:
      "Scroll the window or a specific element to load more content.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: "Tab id to run in." },
        selector: {
          type: Type.STRING,
          description: "Optional CSS selector to scroll inside.",
        },
        to: {
          type: Type.STRING,
          description: "Target position: 'top' | 'bottom'",
        },
        deltaY: {
          type: Type.INTEGER,
          description: "Pixels to scroll by vertically (if provided).",
        },
        behavior: {
          type: Type.STRING,
          description: "Scroll behavior: 'auto' | 'smooth'",
        },
      },
      required: ["tabId"],
    },
    handler: async ({ tabId, selector, to, deltaY, behavior }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      const res = await runInTab(
        tabId,
        (sel?: string, toPos?: string, dY?: number, beh?: ScrollBehavior) => {
          const target: any = sel ? document.querySelector(sel) : window
          console.log("SCROLL target", { sel, toPos, dY, beh, target })
          if (sel && !target) return { ok: false, error: "Selector not found" }
          const scrollOpts = { behavior: (beh as any) || "auto" }
          if (toPos === "top") {
            if (target === window)
              (window as any).scrollTo({ top: 0, ...(scrollOpts as any) })
            else
              (target as HTMLElement).scrollTo({
                top: 0,
                ...(scrollOpts as any),
              })
            return { ok: true }
          }
          if (toPos === "bottom") {
            if (target === window)
              (window as any).scrollTo({
                top: document.body.scrollHeight,
                ...(scrollOpts as any),
              })
            else
              (target as HTMLElement).scrollTo({
                top: (target as HTMLElement).scrollHeight,
                ...(scrollOpts as any),
              })
            return { ok: true }
          }
          const amount = typeof dY === "number" ? dY : 600
          if (target === window)
            (window as any).scrollBy({ top: amount, ...(scrollOpts as any) })
          else
            (target as HTMLElement).scrollBy({
              top: amount,
              ...(scrollOpts as any),
            })
          return { ok: true }
        },
        [
          selector ?? undefined,
          to ?? undefined,
          typeof deltaY === "number" ? deltaY : undefined,
          behavior ?? undefined,
        ]
      )
      return res
    },
  }

  return {
    [getPageContent.name]: getPageContent,
    [fillFormField.name]: fillFormField,
    [clickElement.name]: clickElement,
    [scrollPage.name]: scrollPage,
  }
}
