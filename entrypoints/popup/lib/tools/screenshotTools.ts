import { Type } from "@google/genai"
import type { ToolDefinition } from "../genai"
import type { MustAllowFn } from "./types"
import { isValidId, runInTab } from "./utils"

export function createScreenshotTools({
  mustAllow,
}: {
  mustAllow: MustAllowFn
}): Record<string, ToolDefinition> {
  const takeScreenshot: ToolDefinition = {
    name: "take_screenshot",
    displayName: "Take Screenshot",
    description:
      "Capture a screenshot of the visible area of the tab. Returns a base64 image the model can analyze.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tabId: {
          type: Type.INTEGER,
          description: "Tab id. If omitted, uses the active tab in the current window.",
        },
        format: {
          type: Type.STRING,
          description: "Image format: 'png' or 'jpeg' (default 'jpeg').",
        },
        quality: {
          type: Type.INTEGER,
          description:
            "For jpeg only, quality 0–100 (default 80). Ignored for png.",
        },
      },
    },
    handler: async ({ tabId, format, quality }) => {
      mustAllow()

      let tid: number | undefined = tabId
      let windowId: number | undefined
      if (!isValidId(tid)) {
        const [active] = await browser.tabs.query({ active: true, currentWindow: true })
        tid = active?.id ?? undefined
        windowId = active?.windowId
      } else {
        try {
          const t = await browser.tabs.get(tid)
          windowId = t.windowId
        } catch {
          /* ignore */
        }
      }
      if (!isValidId(tid)) return { ok: false, error: "No valid tabId to capture" }

      const fmt = String(format || "jpeg").toLowerCase() === "png" ? "png" : "jpeg"
      const q = typeof quality === "number" && quality >= 0 && quality <= 100 ? quality : 80

      // Query viewport info inside the tab (best-effort)
      const viewport = await runInTab(
        tid,
        () => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: (window as any).devicePixelRatio || 1,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          href: location.href,
          title: document.title,
        }),
      )

      const dataUrl = await browser.tabs.captureVisibleTab(windowId, {
        format: fmt as any,
        quality: fmt === "jpeg" ? (q as any) : undefined,
      } as any)
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        return { ok: false, error: "Failed to capture screenshot" }
      }

      const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
      if (!match) return { ok: false, error: "Unexpected image data URL format" }
      const mimeType = match[1]
      const base64 = match[2]

      return {
        ok: true,
        screenshot: {
          mimeType,
          base64,
        },
        meta: {
          tabId: tid,
          windowId,
          viewport,
          format: fmt,
          quality: fmt === "jpeg" ? q : undefined,
          capturedAt: Date.now(),
        },
      }
    },
  }

  return { [takeScreenshot.name]: takeScreenshot }
}

