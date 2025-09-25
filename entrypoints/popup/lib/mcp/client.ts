import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
// Note: SSE fallback can be added if needed:
// import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

export type McpToolListItem = {
  name: string
  description?: string
  inputSchema?: any
}

export type McpClientAdapter = {
  label?: string
  selectedTools?: string[]
  listAllTools: () => Promise<McpToolListItem[]>
  callTool: (name: string, args: any) => Promise<any>
  close: () => Promise<void>
}

async function listAllTools(client: any): Promise<McpToolListItem[]> {
  const tools: McpToolListItem[] = []
  let cursor: string | undefined = undefined
  // Paginate until no nextCursor
  // The MCP TS SDK returns { tools, nextCursor }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await client.listTools({ cursor })
    if (Array.isArray(res?.tools)) tools.push(...(res.tools as McpToolListItem[]))
    const next = (res?.nextCursor as string | undefined) ?? undefined
    if (!next) break
    cursor = next
  }
  return tools
}

export type StoredMcpServer = {
  id: string
  name?: string
  baseUrl: string
  enabled?: boolean
  headers?: Record<string, string>
  selectedTools?: string[]
}

export async function createMcpClientFromStorage(): Promise<McpClientAdapter | null> {
  try {
    const {
      mcpServers,
      mcpActiveServerId,
      mcpEnabled,
      mcpBaseUrl,
    } = (await browser.storage.local.get([
      'mcpServers',
      'mcpActiveServerId',
      'mcpEnabled',
      'mcpBaseUrl',
    ])) as {
      mcpServers?: StoredMcpServer[]
      mcpActiveServerId?: string
      mcpEnabled?: boolean
      mcpBaseUrl?: string
    }

    let server: StoredMcpServer | null = null
    if (Array.isArray(mcpServers) && mcpServers.length > 0) {
      server =
        mcpServers.find((s) => s.id === mcpActiveServerId && s.enabled !== false) ??
        mcpServers.find((s) => s.enabled !== false) ??
        null
    } else if (mcpEnabled && mcpBaseUrl) {
      server = {
        id: 'default',
        name: 'Default',
        baseUrl: mcpBaseUrl,
        enabled: true,
      }
    }

    if (!server) return null
    const baseUrl = String(server.baseUrl ?? '').trim()
    if (!baseUrl) return null

    const client = new Client({ name: 'olive', version: '0.1.0' })

    // Prefer Streamable HTTP transport for browser support
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
      requestInit: server.headers ? { headers: server.headers } : undefined,
    })
    await client.connect(transport)

    const adapter: McpClientAdapter = {
      label: server.name ?? server.id,
      selectedTools: Array.isArray(server.selectedTools) ? server.selectedTools : undefined,
      listAllTools: () => listAllTools(client),
      callTool: async (name: string, args: any) => {
        return await client.callTool({ name, arguments: args })
      },
      close: async () => {
        try {
          await client.close()
        } catch {
          // ignore
        }
      },
    }
    return adapter
  } catch (e) {
    console.warn('[mcp] failed to create/connect MCP client', e)
    return null
  }
}

export async function createAllMcpClientsFromStorage(): Promise<McpClientAdapter[]> {
  const adapters: McpClientAdapter[] = []
  try {
    const {
      mcpServers,
      mcpEnabled,
      mcpBaseUrl,
    } = (await browser.storage.local.get([
      'mcpServers',
      'mcpEnabled',
      'mcpBaseUrl',
    ])) as {
      mcpServers?: StoredMcpServer[]
      mcpEnabled?: boolean
      mcpBaseUrl?: string
    }

    const servers: StoredMcpServer[] = []
    if (Array.isArray(mcpServers)) {
      servers.push(...mcpServers.filter((s) => s.enabled !== false && String(s.baseUrl ?? '').trim()))
    }
    if ((!servers.length) && mcpEnabled && mcpBaseUrl) {
      servers.push({ id: 'default', name: 'Default', baseUrl: mcpBaseUrl, enabled: true })
    }

    for (const s of servers) {
      try {
        const client = new Client({ name: 'olive', version: '0.1.0' })
        const transport = new StreamableHTTPClientTransport(new URL(String(s.baseUrl).trim()), {
          requestInit: s.headers ? { headers: s.headers } : undefined,
        })
        await client.connect(transport)
        adapters.push({
          label: s.name ?? s.id,
          selectedTools: Array.isArray(s.selectedTools) ? s.selectedTools : undefined,
          listAllTools: () => listAllTools(client),
          callTool: async (name: string, args: any) => client.callTool({ name, arguments: args }),
          close: async () => {
            try {
              await client.close()
            } catch {}
          },
        })
      } catch (e) {
        console.warn('[mcp] failed to connect to server', s.baseUrl, e)
      }
    }
  } catch (e) {
    console.warn('[mcp] failed to enumerate servers', e)
  }
  return adapters
}
