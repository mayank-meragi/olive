import { Type } from "@google/genai"
import type { ToolDefinition } from "../genai"
import type { MustAllowFn } from "./types"
import { isValidId, runInTab } from "./utils"
import { getScreenshotMeta } from "@/lib/vision/state"

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
        point: {
          type: Type.OBJECT,
          description:
            "Focus element at viewport coordinates then fill. Provide either selector or point.",
          properties: {
            x: { type: Type.INTEGER, description: "X coordinate." },
            y: { type: Type.INTEGER, description: "Y coordinate." },
            unit: {
              type: Type.STRING,
              description: "'px' or 'percent' (default 'px').",
            },
            coordinateSpace: {
              type: Type.STRING,
              description: "'viewport' (default) or 'screenshot' (map using last screenshot).",
            },
            imageWidth: { type: Type.INTEGER, description: "Screenshot image width (px)." },
            imageHeight: { type: Type.INTEGER, description: "Screenshot image height (px)." },
          },
        },
      },
      required: ["tabId", "value"],
    },
    handler: async ({ tabId, selector, value, point }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      const meta = getScreenshotMeta(Number(tabId))
      const augPoint = point && (point as any).coordinateSpace === 'screenshot'
        ? { ...point, imageWidth: meta?.imageWidth || (point as any).imageWidth, imageHeight: meta?.imageHeight || (point as any).imageHeight }
        : point
      const res = await runInTab(
        tabId,
        (
          selOrUndefined?: string,
          val?: string,
          pt?: { x: number; y: number; unit?: string; coordinateSpace?: string; imageWidth?: number; imageHeight?: number }
        ) => {
          const showHighlight = (rect: DOMRect) => {
            try {
              const overlay = document.createElement('div')
              overlay.setAttribute('data-olive-fill-overlay', '1')
              overlay.style.position = 'fixed'
              overlay.style.left = `${Math.max(0, rect.left)}px`
              overlay.style.top = `${Math.max(0, rect.top)}px`
              overlay.style.width = `${Math.max(0, rect.width)}px`
              overlay.style.height = `${Math.max(0, rect.height)}px`
              overlay.style.pointerEvents = 'none'
              overlay.style.zIndex = '2147483647'
              overlay.style.border = '2px solid #3b82f6'
              overlay.style.borderRadius = '6px'
              overlay.style.boxShadow = '0 0 0 2px rgba(59,130,246,0.35), 0 8px 24px rgba(59,130,246,0.25)'
              overlay.style.background = 'rgba(59,130,246,0.10)'
              overlay.style.transition = 'opacity 400ms ease'
              document.documentElement.appendChild(overlay)
              setTimeout(() => {
                overlay.style.opacity = '0'
                setTimeout(() => overlay.remove(), 450)
              }, 350)
            } catch {}
          }
          const showPointRipple = (x: number, y: number) => {
            try {
              const dot = document.createElement('div')
              dot.style.position = 'fixed'
              dot.style.left = `${x - 10}px`
              dot.style.top = `${y - 10}px`
              dot.style.width = '20px'
              dot.style.height = '20px'
              dot.style.borderRadius = '9999px'
              dot.style.pointerEvents = 'none'
              dot.style.zIndex = '2147483647'
              dot.style.border = '3px solid #3b82f6'
              dot.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.25)'
              dot.style.background = 'rgba(59,130,246,0.15)'
              dot.style.opacity = '0.95'
              dot.style.transform = 'scale(0.7)'
              dot.style.transition = 'opacity 600ms ease, transform 600ms ease'
              document.documentElement.appendChild(dot)
              requestAnimationFrame(() => {
                dot.style.opacity = '0'
                dot.style.transform = 'scale(1.25)'
              })
              setTimeout(() => dot.remove(), 650)
            } catch {}
          }
          const fill = (el: any, v: string, viaPoint?: { x: number; y: number }) => {
            const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
            const isCE = !isInput && el && typeof el.isContentEditable === 'boolean' && el.isContentEditable
            if (isInput) {
              try { const r = el.getBoundingClientRect(); showHighlight(r); if (viaPoint) showPointRipple(viaPoint.x, viaPoint.y) } catch {}
              el.focus()
              el.value = v
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
              return { ok: true }
            } else if (isCE) {
              try { const r = el.getBoundingClientRect(); showHighlight(r); if (viaPoint) showPointRipple(viaPoint.x, viaPoint.y) } catch {}
              el.focus()
              el.textContent = v
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
              return { ok: true }
            }
            return { ok: false, error: 'Element is not fillable' }
          }
          if (selOrUndefined && typeof selOrUndefined === 'string' && selOrUndefined.trim()) {
            const el = document.querySelector(selOrUndefined) as any
            console.log('FILL selector', selOrUndefined)
            if (!el) return { ok: false, error: 'Selector not found' }
            try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any }) } catch {}
            return fill(el, String(val ?? ''))
          }
          if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
            let x = pt.x
            let y = pt.y
            const space = (pt.coordinateSpace || 'viewport').toLowerCase()
            if (pt.unit === 'percent') {
              x = Math.round((pt.x / 100) * window.innerWidth)
              y = Math.round((pt.y / 100) * window.innerHeight)
            } else if (space === 'screenshot') {
              const iw = Math.max(1, Number(pt.imageWidth || 0))
              const ih = Math.max(1, Number(pt.imageHeight || 0))
              x = Math.round((pt.x / iw) * window.innerWidth)
              y = Math.round((pt.y / ih) * window.innerHeight)
            }
            const el = document.elementFromPoint(x, y) as any
            console.log('FILL point', { x, y, unit: pt.unit, el })
            if (!el) return { ok: false, error: 'No element at point' }
            return fill(el, String(val ?? ''), { x, y })
          }
          return { ok: false, error: 'Provide selector or point' }
        },
        [
          typeof selector === 'string' ? selector : undefined,
          String(value ?? ''),
          augPoint && typeof (augPoint as any).x === 'number' && typeof (augPoint as any).y === 'number'
            ? {
                x: Number((augPoint as any).x),
                y: Number((augPoint as any).y),
                unit: (augPoint as any)?.unit || 'px',
                coordinateSpace: (augPoint as any)?.coordinateSpace || 'viewport',
                imageWidth: Number((augPoint as any)?.imageWidth || 0),
                imageHeight: Number((augPoint as any)?.imageHeight || 0),
              }
            : undefined,
        ]
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
        point: {
          type: Type.OBJECT,
          description:
            "Click at coordinates instead of selector. Provide either selector or point.",
          properties: {
            x: { type: Type.INTEGER, description: "X coordinate." },
            y: { type: Type.INTEGER, description: "Y coordinate." },
            unit: {
              type: Type.STRING,
              description: "'px' or 'percent' (default 'px').",
            },
            coordinateSpace: {
              type: Type.STRING,
              description: "'viewport' (default) or 'screenshot' (map using last screenshot).",
            },
            imageWidth: { type: Type.INTEGER, description: "Screenshot image width (px)." },
            imageHeight: { type: Type.INTEGER, description: "Screenshot image height (px)." },
          },
        },
      },
      required: ["tabId"],
    },
    handler: async ({ tabId, selector, point }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      const meta = getScreenshotMeta(Number(tabId))
      const augPoint = point && (point as any).coordinateSpace === 'screenshot'
        ? { ...point, imageWidth: meta?.imageWidth || (point as any).imageWidth, imageHeight: meta?.imageHeight || (point as any).imageHeight }
        : point
      const res = await runInTab(
        tabId,
        (
          sel?: string,
          pt?: { x: number; y: number; unit?: string; coordinateSpace?: string; imageWidth?: number; imageHeight?: number }
        ) => {
          const showHighlight = (rect: DOMRect) => {
            try {
              const overlay = document.createElement('div')
              overlay.setAttribute('data-olive-click-overlay', '1')
              overlay.style.position = 'fixed'
              overlay.style.left = `${Math.max(0, rect.left)}px`
              overlay.style.top = `${Math.max(0, rect.top)}px`
              overlay.style.width = `${Math.max(0, rect.width)}px`
              overlay.style.height = `${Math.max(0, rect.height)}px`
              overlay.style.pointerEvents = 'none'
              overlay.style.zIndex = '2147483647'
              overlay.style.border = '2px solid #22c55e'
              overlay.style.borderRadius = '6px'
              overlay.style.boxShadow = '0 0 0 2px rgba(34,197,94,0.35), 0 8px 24px rgba(34,197,94,0.25)'
              overlay.style.background = 'rgba(34,197,94,0.12)'
              overlay.style.transition = 'opacity 400ms ease'
              document.documentElement.appendChild(overlay)
              setTimeout(() => {
                overlay.style.opacity = '0'
                setTimeout(() => overlay.remove(), 450)
              }, 350)
            } catch {}
          }
          const showPointRipple = (x: number, y: number) => {
            try {
              const dot = document.createElement('div')
              dot.style.position = 'fixed'
              dot.style.left = `${x - 10}px`
              dot.style.top = `${y - 10}px`
              dot.style.width = '20px'
              dot.style.height = '20px'
              dot.style.borderRadius = '9999px'
              dot.style.pointerEvents = 'none'
              dot.style.zIndex = '2147483647'
              dot.style.border = '3px solid #22c55e'
              dot.style.boxShadow = '0 0 0 4px rgba(34,197,94,0.25)'
              dot.style.background = 'rgba(34,197,94,0.15)'
              dot.style.opacity = '0.95'
              dot.style.transform = 'scale(0.7)'
              dot.style.transition = 'opacity 600ms ease, transform 600ms ease'
              document.documentElement.appendChild(dot)
              requestAnimationFrame(() => {
                dot.style.opacity = '0'
                dot.style.transform = 'scale(1.25)'
              })
              setTimeout(() => dot.remove(), 650)
            } catch {}
          }
          const clickIt = (el: HTMLElement, viaPoint?: { x: number; y: number }) => {
            try {
              const rect = el.getBoundingClientRect()
              showHighlight(rect)
              if (viaPoint) showPointRipple(viaPoint.x, viaPoint.y)
              // Scroll into view and compute center
              try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any }) } catch {}
              const r = el.getBoundingClientRect()
              const cx = Math.max(0, Math.round(r.left + r.width / 2))
              const cy = Math.max(0, Math.round(r.top + r.height / 2))
              const opts: any = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }
              el.dispatchEvent(new MouseEvent('mousedown', opts))
              el.dispatchEvent(new MouseEvent('mouseup', opts))
              el.dispatchEvent(new MouseEvent('click', opts))
            } catch {
              try { el.click() } catch {}
            }
            try { (el as any).focus?.() } catch {}
            return { ok: true }
          }
          if (sel && typeof sel === 'string' && sel.trim()) {
            try {
              const el = document.querySelector(sel) as HTMLElement | null
              console.log('CLICK selector', sel)
              if (!el) return { ok: false, error: 'selector_not_found' }
              try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any }) } catch {}
              return clickIt(el)
            } catch (e: any) {
              return { ok: false, error: 'invalid_selector_syntax', message: String(e?.message || e) }
            }
          }
          if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
            let x = pt.x
            let y = pt.y
            const space = (pt.coordinateSpace || 'viewport').toLowerCase()
            if (pt.unit === 'percent') {
              x = Math.round((pt.x / 100) * window.innerWidth)
              y = Math.round((pt.y / 100) * window.innerHeight)
            } else if (space === 'screenshot') {
              const iw = Math.max(1, Number(pt.imageWidth || 0))
              const ih = Math.max(1, Number(pt.imageHeight || 0))
              // Map screenshot px to current viewport CSS px proportionally
              x = Math.round((pt.x / iw) * window.innerWidth)
              y = Math.round((pt.y / ih) * window.innerHeight)
            }
            // choose most clickable element under point
            const stack = (document as any).elementsFromPoint?.(x, y) as HTMLElement[] | undefined
            const isVisible = (el: HTMLElement) => {
              const cs = getComputedStyle(el)
              const r = el.getClientRects()
              return r.length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01
            }
            const isClickable = (el: HTMLElement) => {
              const name = el.nodeName.toLowerCase()
              const role = el.getAttribute('role') || ''
              return (
                name === 'a' || name === 'button' || name === 'input' ||
                role === 'button' || el.onclick != null || el.getAttribute('tabindex') != null
              )
            }
            let target = stack?.find((el) => isVisible(el) && isClickable(el)) ?? null
            if (!target) {
              const top = stack?.[0] as HTMLElement | undefined
              let cur: HTMLElement | null | undefined = top
              while (cur && !isClickable(cur)) cur = cur.parentElement
              if (cur && isVisible(cur)) target = cur
            }
            if (!target) target = document.elementFromPoint(x, y) as HTMLElement | null
            console.log('CLICK point', { x, y, unit: pt.unit, space, target })
            if (!target) return { ok: false, error: 'no_element_at_point' }
            return clickIt(target, { x, y })
          }
          return { ok: false, error: 'Provide selector or point' }
        },
        [
          typeof selector === 'string' ? selector : undefined,
          augPoint && typeof (augPoint as any).x === 'number' && typeof (augPoint as any).y === 'number'
            ? {
                x: Number((augPoint as any).x),
                y: Number((augPoint as any).y),
                unit: (augPoint as any)?.unit || 'px',
                coordinateSpace: (augPoint as any)?.coordinateSpace || 'viewport',
                imageWidth: Number((augPoint as any)?.imageWidth || 0),
                imageHeight: Number((augPoint as any)?.imageHeight || 0),
              }
            : undefined,
        ]
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
        point: {
          type: Type.OBJECT,
          description:
            "Scroll container under viewport point if selector not provided.",
          properties: {
            x: { type: Type.INTEGER, description: "X coordinate." },
            y: { type: Type.INTEGER, description: "Y coordinate." },
            unit: {
              type: Type.STRING,
              description: "'px' or 'percent' (default 'px').",
            },
            coordinateSpace: {
              type: Type.STRING,
              description: "'viewport' (default) or 'screenshot' (map using last screenshot).",
            },
            imageWidth: { type: Type.INTEGER, description: "Screenshot image width (px)." },
            imageHeight: { type: Type.INTEGER, description: "Screenshot image height (px)." },
          },
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
    handler: async ({ tabId, selector, to, deltaY, behavior, point }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      const meta = getScreenshotMeta(Number(tabId))
      const augPoint = point && (point as any).coordinateSpace === 'screenshot'
        ? { ...point, imageWidth: meta?.imageWidth || (point as any).imageWidth, imageHeight: meta?.imageHeight || (point as any).imageHeight }
        : point
      const res = await runInTab(
        tabId,
          (
          sel?: string,
          toPos?: string,
          dY?: number,
          beh?: ScrollBehavior,
          pt?: { x: number; y: number; unit?: string }
        ) => {
          const showViewportHighlight = () => {
            try {
              const overlay = document.createElement('div')
              overlay.setAttribute('data-olive-scroll-overlay', '1')
              overlay.style.position = 'fixed'
              overlay.style.left = '0px'
              overlay.style.top = '0px'
              overlay.style.width = '100vw'
              overlay.style.height = '100vh'
              overlay.style.pointerEvents = 'none'
              overlay.style.zIndex = '2147483647'
              overlay.style.border = '2px dashed #a855f7'
              overlay.style.boxShadow = 'inset 0 0 0 4px rgba(168,85,247,0.25)'
              overlay.style.borderRadius = '10px'
              overlay.style.transition = 'opacity 450ms ease'
              document.documentElement.appendChild(overlay)
              setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 500) }, 400)
            } catch {}
          }
          const showHighlight = (rect: DOMRect) => {
            try {
              const overlay = document.createElement('div')
              overlay.setAttribute('data-olive-scroll-target', '1')
              overlay.style.position = 'fixed'
              overlay.style.left = `${Math.max(0, rect.left)}px`
              overlay.style.top = `${Math.max(0, rect.top)}px`
              overlay.style.width = `${Math.max(0, rect.width)}px`
              overlay.style.height = `${Math.max(0, rect.height)}px`
              overlay.style.pointerEvents = 'none'
              overlay.style.zIndex = '2147483647'
              overlay.style.border = '2px dashed #a855f7'
              overlay.style.borderRadius = '8px'
              overlay.style.boxShadow = '0 0 0 2px rgba(168,85,247,0.35), 0 8px 24px rgba(168,85,247,0.25)'
              overlay.style.background = 'rgba(168,85,247,0.10)'
              overlay.style.transition = 'opacity 450ms ease'
              document.documentElement.appendChild(overlay)
              setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 500) }, 450)
            } catch {}
          }

          let target: any = sel ? document.querySelector(sel) : window
          if (!sel && pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
            let x = pt.x
            let y = pt.y
            const space = (pt.coordinateSpace || 'viewport').toLowerCase()
            if (pt.unit === 'percent') {
              x = Math.round((pt.x / 100) * window.innerWidth)
              y = Math.round((pt.y / 100) * window.innerHeight)
            } else if (space === 'screenshot') {
              const iw = Math.max(1, Number(pt.imageWidth || 0))
              const ih = Math.max(1, Number(pt.imageHeight || 0))
              x = Math.round((pt.x / iw) * window.innerWidth)
              y = Math.round((pt.y / ih) * window.innerHeight)
            }
            const el = document.elementFromPoint(x, y) as HTMLElement | null
            if (el) target = el
          }
          console.log("SCROLL target", { sel, toPos, dY, beh, target })
          if (sel && !target) return { ok: false, error: "Selector not found" }
          const scrollOpts = { behavior: (beh as any) || "auto" }
          if (toPos === "top") {
            if (target === window) {
              showViewportHighlight()
              (window as any).scrollTo({ top: 0, ...(scrollOpts as any) })
            } else {
              try { const r = (target as HTMLElement).getBoundingClientRect(); showHighlight(r) } catch {}
              (target as HTMLElement).scrollTo({
                top: 0,
                ...(scrollOpts as any),
              })
            }
            return { ok: true }
          }
          if (toPos === "bottom") {
            if (target === window) {
              showViewportHighlight()
              (window as any).scrollTo({
                top: document.body.scrollHeight,
                ...(scrollOpts as any),
              })
            } else {
              try { const r = (target as HTMLElement).getBoundingClientRect(); showHighlight(r) } catch {}
              (target as HTMLElement).scrollTo({
                top: (target as HTMLElement).scrollHeight,
                ...(scrollOpts as any),
              })
            }
            return { ok: true }
          }
          const amount = typeof dY === "number" ? dY : 600
          if (target === window) {
            showViewportHighlight()
            (window as any).scrollBy({ top: amount, ...(scrollOpts as any) })
          } else {
            try { const r = (target as HTMLElement).getBoundingClientRect(); showHighlight(r) } catch {}
            (target as HTMLElement).scrollBy({
              top: amount,
              ...(scrollOpts as any),
            })
          }
          return { ok: true }
        },
        [
          selector ?? undefined,
          to ?? undefined,
          typeof deltaY === "number" ? deltaY : undefined,
          behavior ?? undefined,
          augPoint && typeof (augPoint as any).x === 'number' && typeof (augPoint as any).y === 'number'
            ? {
                x: Number((augPoint as any).x),
                y: Number((augPoint as any).y),
                unit: (augPoint as any)?.unit || 'px',
                coordinateSpace: (augPoint as any)?.coordinateSpace || 'viewport',
                imageWidth: Number((augPoint as any)?.imageWidth || 0),
                imageHeight: Number((augPoint as any)?.imageHeight || 0),
              }
            : undefined,
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
