export type ScreenshotMeta = {
  tabId: number
  imageWidth: number
  imageHeight: number
  capturedAt: number
}

const byTab = new Map<number, ScreenshotMeta>()

export function updateScreenshotMeta(meta: ScreenshotMeta) {
  if (typeof meta?.tabId === 'number') byTab.set(meta.tabId, meta)
}

export function getScreenshotMeta(tabId: number): ScreenshotMeta | undefined {
  return byTab.get(tabId)
}

