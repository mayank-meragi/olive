import { Type } from "@google/genai"
import type { ToolDefinition } from "../genai"
import type { MustAllowFn } from "./types"
import { isValidId, runInTab } from "./utils"
import { getScreenshotMeta } from "@/lib/vision/state"

export function createLocatorTools({
  mustAllow,
}: {
  mustAllow: MustAllowFn
}): Record<string, ToolDefinition> {
  const locateElement: ToolDefinition = {
    name: "locate_element",
    displayName: "Locate Element",
    description:
      "Find elements by text/label/role/placeholder/alt/title. Returns candidate selectors and metadata.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: "Tab id to run in." },
        strategy: {
          type: Type.STRING,
          description:
            "One of: text | label | role | placeholder | alt | title",
        },
        value: { type: Type.STRING, description: "Locator value to match." },
        exact: { type: Type.BOOLEAN, description: "Exact match (default false)." },
        nth: { type: Type.INTEGER, description: "1-based index to select a candidate." },
        withinSelector: {
          type: Type.STRING,
          description: "Optional container selector to scope the search.",
        },
        limit: { type: Type.INTEGER, description: "Max candidates to return (default 5)." },
        prefer: {
          type: Type.STRING,
          description: "Preferred target type: auto | clickable | fillable (default auto).",
        },
      },
      required: ["tabId", "strategy", "value"],
    },
    handler: async ({ tabId, strategy, value, exact, nth, withinSelector, limit = 5, prefer = "auto" }) => {
      mustAllow()
      if (!isValidId(tabId)) return { ok: false, error: "Invalid tabId" }
      const res = await runInTab(
        tabId,
        (
          strat: string,
          val: string,
          exact?: boolean,
          nth?: number,
          within?: string,
          limit?: number,
          prefer?: string,
        ) => {
          const cssEscape = (window as any).CSS?.escape || ((s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`))
          const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()
          const matchText = (el: Element) => norm((el as HTMLElement).innerText || "")
          const isVisible = (el: Element) => {
            const cs = getComputedStyle(el as HTMLElement)
            const r = (el as HTMLElement).getClientRects()
            return r.length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01
          }
          const isClickable = (el: Element) => {
            const e = el as HTMLElement
            const name = e.nodeName.toLowerCase()
            const role = e.getAttribute('role') || ''
            return name === 'a' || name === 'button' || name === 'input' || role === 'button' || e.onclick != null || e.getAttribute('tabindex') != null
          }
          const isFillable = (el: Element) => {
            const e: any = el
            return e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || (typeof e.isContentEditable === 'boolean' && e.isContentEditable)
          }
          const nameFor = (el: Element) => {
            const e = el as HTMLElement
            return (
              e.getAttribute('aria-label') ||
              (e.getAttribute('aria-labelledby') ? (document.getElementById(e.getAttribute('aria-labelledby')!)?.innerText || '') : '') ||
              (e as HTMLImageElement).alt ||
              e.title ||
              (e as HTMLElement).innerText ||
              ''
            ).trim()
          }
          const buildSelector = (el: Element): string => {
            const e = el as HTMLElement
            if (e.id) return `#${cssEscape(e.id)}`
            const testIds = ['data-testid', 'data-test-id', 'data-qa']
            for (const attr of testIds) {
              const v = e.getAttribute(attr)
              if (v) return `[${attr}="${v}"]`
            }
            const parts: string[] = []
            let cur: HTMLElement | null = e
            let depth = 0
            while (cur && depth < 4) {
              let part = cur.tagName.toLowerCase()
              if (cur.classList.length && cur.classList.length <= 3) {
                part += '.' + Array.from(cur.classList).slice(0, 3).map((c) => cssEscape(c)).join('.')
              }
              const parent = cur.parentElement
              if (parent) {
                const siblings = Array.from(parent.children).filter((ch) => (ch as HTMLElement).tagName === cur!.tagName)
                if (siblings.length > 1) {
                  const idx = siblings.indexOf(cur) + 1
                  part += `:nth-of-type(${idx})`
                }
              }
              parts.unshift(part)
              cur = parent
              depth += 1
            }
            return parts.join(' > ')
          }

          const root: ParentNode = within ? (document.querySelector(within) || document) : document
          const candidates: Element[] = []
          const valN = norm(String(val || ''))
          const pushIf = (el: Element) => { if (isVisible(el)) candidates.push(el) }

          switch ((strat || '').toLowerCase()) {
            case 'text': {
              const all = Array.from(root.querySelectorAll<HTMLElement>('body *'))
              for (const el of all) {
                const t = matchText(el)
                if (!t) continue
                const ok = exact ? t === valN : t.includes(valN)
                if (ok) pushIf(el)
              }
              break
            }
            case 'label': {
              const labels = Array.from(root.querySelectorAll('label'))
              for (const lab of labels) {
                const t = norm(lab.innerText || '')
                const ok = exact ? t === valN : t.includes(valN)
                if (!ok) continue
                const forId = lab.getAttribute('for')
                if (forId) {
                  const el = document.getElementById(forId)
                  if (el) pushIf(el)
                } else {
                  const input = lab.querySelector('input, textarea, [contenteditable="true"]')
                  if (input) pushIf(input)
                }
              }
              break
            }
            case 'role': {
              const all = Array.from(root.querySelectorAll<HTMLElement>('body *'))
              for (const el of all) {
                const r = (el.getAttribute('role') || '').toLowerCase()
                if (r === valN) pushIf(el)
              }
              break
            }
            case 'placeholder': {
              const all = Array.from(root.querySelectorAll<HTMLElement>('input, textarea'))
              for (const el of all) {
                const ph = norm((el as HTMLInputElement).placeholder || '')
                const ok = exact ? ph === valN : ph.includes(valN)
                if (ok) pushIf(el)
              }
              break
            }
            case 'alt': {
              const all = Array.from(root.querySelectorAll<HTMLElement>('img, area'))
              for (const el of all) {
                const a = norm((el as HTMLImageElement).alt || '')
                const ok = exact ? a === valN : a.includes(valN)
                if (ok) pushIf(el)
              }
              break
            }
            case 'title': {
              const all = Array.from(root.querySelectorAll<HTMLElement>('[title]'))
              for (const el of all) {
                const t = norm((el as HTMLElement).title || '')
                const ok = exact ? t === valN : t.includes(valN)
                if (ok) pushIf(el)
              }
              break
            }
            default:
              return { ok: false, error: 'unsupported_strategy' }
          }

          // Prefer clickable/fillable if requested
          let filtered = candidates
          if ((prefer || 'auto') === 'clickable') filtered = candidates.filter(isClickable)
          if ((prefer || 'auto') === 'fillable') filtered = candidates.filter(isFillable)
          // Deduplicate by element
          const uniq: Element[] = []
          const seen = new Set<Element>()
          for (const el of filtered) { if (!seen.has(el)) { seen.add(el); uniq.push(el) } }

          const buildOut = (el: Element) => {
            const rect = (el as HTMLElement).getBoundingClientRect()
            return {
              selector: buildSelector(el),
              role: (el as HTMLElement).getAttribute('role') || '',
              name: nameFor(el),
              textPreview: (el as HTMLElement).innerText?.slice(0, 120) || '',
              rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
              clickable: isClickable(el),
              fillable: isFillable(el),
            }
          }
          const out = uniq.slice(0, Math.max(1, Number(limit || 5))).map(buildOut)
          const index = typeof nth === 'number' && nth > 0 ? nth - 1 : 0
          const selected = out[index]
          return { ok: out.length > 0, candidates: out, selected }
        },
        [String(strategy), String(value), Boolean(exact), typeof nth === 'number' ? nth : undefined, typeof withinSelector === 'string' ? withinSelector : undefined, typeof limit === 'number' ? limit : undefined, String(prefer || 'auto')]
      )
      return res
    },
  }

  const verifyTarget: ToolDefinition = {
    name: "verify_target",
    displayName: "Verify Target",
    description:
      "Preflight check: highlight and describe a target by selector, locate, or point. Does not click.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: { type: Type.INTEGER, description: "Tab id to run in." },
        selector: { type: Type.STRING, description: "Target CSS selector." },
        locate: {
          type: Type.OBJECT,
          description: "Locate parameters (same as locate_element).",
          properties: {
            strategy: { type: Type.STRING },
            value: { type: Type.STRING },
            exact: { type: Type.BOOLEAN },
            nth: { type: Type.INTEGER },
            withinSelector: { type: Type.STRING },
            prefer: { type: Type.STRING },
          },
        },
        point: {
          type: Type.OBJECT,
          description: "Viewport or screenshot coordinate.",
          properties: {
            x: { type: Type.INTEGER },
            y: { type: Type.INTEGER },
            unit: { type: Type.STRING },
            coordinateSpace: { type: Type.STRING },
            imageWidth: { type: Type.INTEGER },
            imageHeight: { type: Type.INTEGER },
          },
        },
      },
      required: ["tabId"],
    },
    handler: async ({ tabId, selector, locate, point }) => {
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
          loc?: { strategy: string; value: string; exact?: boolean; nth?: number; withinSelector?: string; prefer?: string },
          pt?: { x: number; y: number; unit?: string; coordinateSpace?: string; imageWidth?: number; imageHeight?: number }
        ) => {
          const cssEscape = (window as any).CSS?.escape || ((s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`))
          const isVisible = (el: Element) => {
            const cs = getComputedStyle(el as HTMLElement)
            const r = (el as HTMLElement).getClientRects()
            return r.length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01
          }
          const isClickable = (el: Element) => {
            const e = el as HTMLElement
            const name = e.nodeName.toLowerCase()
            const role = e.getAttribute('role') || ''
            return name === 'a' || name === 'button' || name === 'input' || role === 'button' || e.onclick != null || e.getAttribute('tabindex') != null
          }
          const isFillable = (el: Element) => {
            const e: any = el
            return e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || (typeof e.isContentEditable === 'boolean' && e.isContentEditable)
          }
          const highlight = (rect: DOMRect) => {
            try {
              const overlay = document.createElement('div')
              overlay.style.position = 'fixed'
              overlay.style.left = `${Math.max(0, rect.left)}px`
              overlay.style.top = `${Math.max(0, rect.top)}px`
              overlay.style.width = `${Math.max(0, rect.width)}px`
              overlay.style.height = `${Math.max(0, rect.height)}px`
              overlay.style.pointerEvents = 'none'
              overlay.style.zIndex = '2147483647'
              overlay.style.border = '2px solid #f59e0b'
              overlay.style.borderRadius = '6px'
              overlay.style.background = 'rgba(245,158,11,0.12)'
              overlay.style.transition = 'opacity 450ms ease'
              document.documentElement.appendChild(overlay)
              setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 500) }, 400)
            } catch {}
          }
          const outFor = (el: Element) => {
            const rect = (el as HTMLElement).getBoundingClientRect()
            highlight(rect)
            return {
              selector: (el as HTMLElement).id ? `#${cssEscape((el as HTMLElement).id)}` : (el as HTMLElement).tagName.toLowerCase(),
              rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
              clickable: isClickable(el),
              fillable: isFillable(el),
              role: (el as HTMLElement).getAttribute('role') || '',
              textPreview: (el as HTMLElement).innerText?.slice(0, 120) || '',
            }
          }
          // Resolve by selector
          if (sel && sel.trim()) {
            try {
              const el = document.querySelector(sel) as HTMLElement | null
              if (!el) return { ok: false, reason: 'selector_not_found' }
              if (!isVisible(el)) el.scrollIntoView({ block: 'center', inline: 'center' })
              return { ok: true, target: outFor(el) }
            } catch (e: any) {
              return { ok: false, reason: 'invalid_selector_syntax', message: String(e?.message || e) }
            }
          }
          // Resolve by locate
          if (loc && loc.strategy && typeof loc.value === 'string') {
            const locateRes = (window as any).locateElementInternal?.(loc)
            if (locateRes && locateRes.selectedEl && isVisible(locateRes.selectedEl)) {
              return { ok: true, target: outFor(locateRes.selectedEl) }
            }
          }
          // Resolve by point
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
            const el = document.elementFromPoint(x, y)
            if (el) return { ok: true, target: outFor(el) }
            return { ok: false, reason: 'no_element_at_point' }
          }
          return { ok: false, reason: 'no_target_specified' }
        },
        [typeof selector === 'string' ? selector : undefined, locate ? {
          strategy: String(locate.strategy || ''),
          value: String(locate.value || ''),
          exact: Boolean(locate.exact),
          nth: typeof locate.nth === 'number' ? locate.nth : undefined,
          withinSelector: typeof locate.withinSelector === 'string' ? locate.withinSelector : undefined,
          prefer: String(locate.prefer || 'auto'),
        } : undefined, augPoint ? {
          x: Number(augPoint.x), y: Number(augPoint.y), unit: augPoint.unit || 'px', coordinateSpace: augPoint.coordinateSpace || 'viewport', imageWidth: Number(augPoint.imageWidth || 0), imageHeight: Number(augPoint.imageHeight || 0)
        } : undefined]
      )
      return res
    },
  }

  return {
    [locateElement.name]: locateElement,
    [verifyTarget.name]: verifyTarget,
  }
}

