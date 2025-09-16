import { useEffect } from 'react'

export function useTextareaAutoResize(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx: number = 160
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const max = typeof maxPx === 'number' && maxPx > 0 ? maxPx : 160
    el.style.height = Math.min(el.scrollHeight, max) + 'px'
  }, [ref, value, maxPx])
}

