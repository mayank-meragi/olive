export const tryDebug = (debug: boolean | undefined, ...args: any[]) => {
  if (!debug) return
  try {
    console.debug(...args)
  } catch {
    // ignore environments without console.debug
  }
}
