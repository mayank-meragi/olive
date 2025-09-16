import { useEffect } from 'react'

export function useScrollToBottom(ref: React.RefObject<HTMLElement | null>, dep: any) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } catch {
      // no-op
    }
  }, [ref, dep])
}

