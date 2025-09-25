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
