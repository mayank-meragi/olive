import React from 'react'
import ReactDOM from 'react-dom/client'

// Tailwind for the sidebar UI
import './content/style.css'
import { SidebarApp } from './content/SidebarApp'

let ui: Awaited<ReturnType<typeof createShadowRootUi<ReactDOM.Root>>> | null = null

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    // Listen for toggle requests from the popup
    browser.runtime.onMessage.addListener(async (msg) => {
      if (!msg || msg.type !== 'olive:toggle-sidebar') return
      if (!ui) ui = await mountUI(ctx)
      else toggleMount()
    })

    // Optionally auto-mount for testing
    // ui = await mountUI(ctx)
  },
})

async function mountUI(ctx: any) {
  const created = await createShadowRootUi<ReactDOM.Root>(ctx, {
    name: 'olive-sidebar-root',
    position: 'modal',
    zIndex: 2147483647, // Max z-index so we’re above page chrome
    onMount: (uiContainer, _shadow, shadowHost) => {
      // Style the shadow host to align right and full-height
      Object.assign(shadowHost.style, {
        position: 'fixed',
        inset: '0px',
        pointerEvents: 'none',
      })

      // Let the inner container handle interactions and layout
      Object.assign(uiContainer.style, {
        pointerEvents: 'auto',
      })

      const root = ReactDOM.createRoot(uiContainer)
      root.render(<SidebarApp />)
      return root
    },
    onRemove: (root) => {
      root?.unmount()
    },
  })

  created.mount()
  return created
}

function toggleMount() {
  if (!ui) return
  // Heuristic: if there's a child, assume mounted
  const mounted = (ui.uiContainer as HTMLElement).childElementCount > 0
  if (mounted) ui.remove()
  else ui.mount()
}

