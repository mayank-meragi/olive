import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Save, Trash2, TestTube2, Radio, CheckSquare, Square, ChevronDown } from 'lucide-react'
import type { StoredMcpServer } from '@/lib/mcp/client'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

type EditableServer = StoredMcpServer & { _isNew?: boolean }

async function loadServers(): Promise<{
  servers: StoredMcpServer[]
  activeId?: string
}> {
  const { mcpServers, mcpActiveServerId } = (await browser.storage.local.get([
    'mcpServers',
    'mcpActiveServerId',
  ])) as { mcpServers?: StoredMcpServer[]; mcpActiveServerId?: string }
  return { servers: Array.isArray(mcpServers) ? mcpServers : [], activeId: mcpActiveServerId }
}

async function saveServers(servers: StoredMcpServer[], activeId?: string) {
  await browser.storage.local.set({ mcpServers: servers, mcpActiveServerId: activeId })
}

export function McpServersPanel() {
  const [servers, setServers] = useState<EditableServer[]>([])
  const [activeId, setActiveId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<Record<string, string>>({})
  const [toolsMap, setToolsMap] = useState<Record<string, McpToolItem[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  type McpToolItem = { name: string; description?: string; selected: boolean }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { servers, activeId } = await loadServers()
      setServers(servers)
      setActiveId(activeId)
      setLoading(false)
    })()
  }, [])

  const addNew = () => {
    const id = crypto.randomUUID()
    setServers((prev) => [
      ...prev,
      { id, name: 'New MCP Server', baseUrl: '', enabled: true, headers: {}, _isNew: true },
    ])
  }

  const updateServer = (id: string, patch: Partial<EditableServer>) => {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeServer = (id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id))
    setTestStatus((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
    if (activeId === id) setActiveId(undefined)
  }

  const saveAll = async () => {
    const cleaned = servers.map(({ _isNew, ...s }) => s)
    // Persist selected tools into server entries
    const withSelections = cleaned.map((s) => {
      const list = toolsMap[s.id]
      if (Array.isArray(list) && list.length) {
        const selected = list.filter((t) => t.selected).map((t) => t.name)
        return { ...s, selectedTools: selected }
      }
      // If we have no in-memory list, keep what user already had
      return s
    })
    await saveServers(withSelections, activeId)
    setServers(withSelections)
  }

  const testConnection = async (srv: EditableServer) => {
    const url = (srv.baseUrl ?? '').trim()
    if (!url) {
      setTestStatus((prev) => ({ ...prev, [srv.id]: 'Enter a base URL first' }))
      return
    }
    setTestingId(srv.id)
    setTestStatus((prev) => ({ ...prev, [srv.id]: 'Testing…' }))
    try {
      const client = new Client({ name: 'olive', version: '0.1.0' })
      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: srv.headers && Object.keys(srv.headers).length
          ? { headers: srv.headers }
          : undefined,
      })
      await client.connect(transport)
      const list = await client.listTools({})
      await client.close()
      const count = Array.isArray(list?.tools) ? list.tools.length : 0
      setTestStatus((prev) => ({ ...prev, [srv.id]: `OK — ${count} tool(s)` }))
      // Update toolsMap with fetched tools, preserving existing selections
      const existing = toolsMap[srv.id] ?? []
      const selectedSet = new Set(existing.filter((t) => t.selected).map((t) => t.name))
      const fetched: McpToolItem[] = (Array.isArray(list?.tools) ? list.tools : []).map((t: any) => ({
        name: String(t?.name ?? ''),
        description: t?.description,
        selected: existing.length ? selectedSet.has(String(t?.name ?? '')) : Array.isArray(srv.selectedTools) ? srv.selectedTools.includes(String(t?.name ?? '')) : true,
      })).filter((t) => t.name)
      setToolsMap((prev) => ({ ...prev, [srv.id]: fetched }))
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e)
      setTestStatus((prev) => ({ ...prev, [srv.id]: `Failed — ${msg}` }))
    } finally {
      setTestingId(null)
    }
  }

  const canSave = useMemo(() => {
    return servers.every((s) => !s.enabled || Boolean((s.baseUrl ?? '').trim()))
  }, [servers])

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">MCP Servers</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addNew}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
          <Button variant="default" size="sm" onClick={saveAll} disabled={!canSave}>
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-2 text-sm text-muted-foreground">Loading…</div>
      ) : servers.length === 0 ? (
        <div className="rounded border p-3 text-sm text-muted-foreground">
          No servers yet. Click Add to create one.
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((srv) => (
            <div key={srv.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    className={`inline-flex items-center rounded px-2 py-1 text-xs ${
                      activeId === srv.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                    aria-label={activeId === srv.id ? 'Active server' : 'Set active server'}
                    onClick={() => setActiveId(srv.id)}
                    title="Set active"
                  >
                    <Radio className="mr-1 h-3 w-3" /> Active
                  </button>
                  <Input
                    className="h-8 flex-1"
                    value={srv.name ?? ''}
                    onChange={(e) => updateServer(srv.id, { name: e.target.value })}
                    placeholder="Server name"
                  />
                  <button
                    className="inline-flex items-center rounded px-2 py-1 text-xs bg-muted text-muted-foreground"
                    onClick={() => setExpanded((prev) => ({ ...prev, [srv.id]: !prev[srv.id] }))}
                    aria-expanded={!!expanded[srv.id]}
                    title="Toggle tools section"
                  >
                    <ChevronDown className={`mr-1 h-3 w-3 transition-transform ${expanded[srv.id] ? 'rotate-180' : ''}`} /> Tools
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs">
                    <Switch
                      id={`mcp-enabled-${srv.id}`}
                      checked={srv.enabled !== false}
                      onCheckedChange={(v) => updateServer(srv.id, { enabled: v })}
                    />
                    <Label htmlFor={`mcp-enabled-${srv.id}`}>Enabled</Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete server"
                    onClick={() => removeServer(srv.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2">
                <div>
                  <Label htmlFor={`mcp-url-${srv.id}`}>Base URL</Label>
                  <Input
                    id={`mcp-url-${srv.id}`}
                    placeholder="https://example.com/mcp"
                    value={srv.baseUrl ?? ''}
                    onChange={(e) => updateServer(srv.id, { baseUrl: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`mcp-hkey-${srv.id}`}>Auth Header</Label>
                    <Input
                      id={`mcp-hkey-${srv.id}`}
                      placeholder="Authorization"
                      value={Object.keys(srv.headers ?? {})[0] ?? ''}
                      onChange={(e) => {
                        const key = e.target.value
                        const val = Object.values(srv.headers ?? {})[0]
                        const headers = key ? { [key]: val ?? '' } : {}
                        updateServer(srv.id, { headers })
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`mcp-hval-${srv.id}`}>Header Value</Label>
                    <Input
                      id={`mcp-hval-${srv.id}`}
                      placeholder="Bearer <token>"
                      value={Object.values(srv.headers ?? {})[0] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        const key = Object.keys(srv.headers ?? {})[0]
                        const headers = key ? { [key]: val } : {}
                        updateServer(srv.id, { headers })
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <div>{testStatus[srv.id]}</div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(srv)}
                    disabled={testingId === srv.id}
                  >
                    <TestTube2 className="mr-1 h-4 w-4" /> Test
                  </Button>
                </div>
              </div>

              {expanded[srv.id] && (
                <div className="mt-3 rounded-md border p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-medium">Tool selection</div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnection(srv)}
                        disabled={testingId === srv.id}
                        title="Fetch tools"
                      >
                        Refresh
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const list = toolsMap[srv.id] ?? []
                          const next = list.map((t) => ({ ...t, selected: true }))
                          setToolsMap((prev) => ({ ...prev, [srv.id]: next }))
                        }}
                      >
                        Select all
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const list = toolsMap[srv.id] ?? []
                          const next = list.map((t) => ({ ...t, selected: false }))
                          setToolsMap((prev) => ({ ...prev, [srv.id]: next }))
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-auto space-y-1">
                    {(toolsMap[srv.id] ?? []).length === 0 ? (
                      <div className="text-xs text-muted-foreground">No tools loaded. Click Refresh to fetch.</div>
                    ) : (
                      (toolsMap[srv.id] ?? []).map((t) => (
                        <label key={t.name} className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={t.selected}
                            onChange={(e) => {
                              const list = toolsMap[srv.id] ?? []
                              const next = list.map((x) => (x.name === t.name ? { ...x, selected: e.target.checked } : x))
                              setToolsMap((prev) => ({ ...prev, [srv.id]: next }))
                            }}
                          />
                          <span className="truncate">
                            <span className="font-medium">{t.name}</span>
                            {t.description ? <span className="text-muted-foreground"> — {t.description}</span> : null}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {(toolsMap[srv.id] ?? []).filter((t) => t.selected).length} selected of {(toolsMap[srv.id] ?? []).length}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
