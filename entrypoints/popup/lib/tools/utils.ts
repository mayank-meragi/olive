export function ensureHttpUrl(url: unknown): string | null {
  try {
    const u = new URL(String(url))
    if (!/^https?:$/.test(u.protocol)) return null
    return u.toString()
  } catch {
    return null
  }
}

export function isValidId(id: unknown): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id >= 0
}

export async function runInTab<T = any>(
  tabId: number,
  fn: (...args: any[]) => T | Promise<T>,
  args: any[] = [],
): Promise<T> {
  try {
    const anyBrowser: any = browser as any
    if (anyBrowser?.scripting?.executeScript) {
      const res = await anyBrowser.scripting.executeScript({ target: { tabId }, func: fn, args })
      return res?.[0]?.result as T
    }
  } catch (e) {
    /* ignore and fall through */
  }
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
