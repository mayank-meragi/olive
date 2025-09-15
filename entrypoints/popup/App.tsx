import { useEffect, useState } from 'react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function App() {
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { geminiApiKey } = await browser.storage.local.get('geminiApiKey')
      if (geminiApiKey) setApiKey(geminiApiKey as string)
    })()
  }, [])

  async function saveKey() {
    await browser.storage.local.set({ geminiApiKey: apiKey.trim() })
    setStatus('Saved')
    setTimeout(() => setStatus(null), 1500)
  }

  async function openSidebar() {
    try {
      if ((browser as any).sidebarAction?.open) {
        await (browser as any).sidebarAction.open()
      }
      window.close()
    } catch (e) {
      // Fallback to content overlay toggle if sidebar API fails
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
        if (tab?.id != null) await browser.tabs.sendMessage(tab.id, { type: 'olive:toggle-sidebar' })
        window.close()
      } catch {
        setStatus('Please refresh tab and try again')
        setTimeout(() => setStatus(null), 2000)
      }
    }
  }

  return (
    <div className="min-w-[340px] max-w-sm p-4">
      <h1 className="mb-3 text-center text-lg font-semibold">Olive</h1>
      <div className="space-y-2">
        <Label htmlFor="gemini">Gemini API Key</Label>
        <Input
          id="gemini"
          placeholder="AIza..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button onClick={saveKey}>Save</Button>
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>
      </div>
      <div className="mt-4 border-t pt-3">
        <Button className="w-full" onClick={openSidebar}>
          Open Sidebar
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Tip: Click again to toggle the sidebar.
      </p>
    </div>
  )
}

export default App
