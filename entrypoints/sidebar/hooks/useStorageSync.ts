import { useEffect, useState } from 'react'

export function useStorageSync<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = (await browser.storage.local.get([key])) as Record<string, any>
        if (!alive) return
        if (data && key in data && typeof data[key] !== 'undefined') {
          setValue(data[key] as T)
        }
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [key])

  useEffect(() => {
    if (!ready) return
    void browser.storage.local.set({ [key]: value })
  }, [key, value, ready])

  return [value, setValue, ready] as const
}

