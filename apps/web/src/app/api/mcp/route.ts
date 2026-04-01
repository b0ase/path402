/**
 * POST /api/mcp — Streamable HTTP transport for the $402 MCP server
 *
 * Allows AI agents to connect to the Path402 MCP server via HTTP.
 */

import { NextRequest } from 'next/server';
import { server } from '@b0ase/path402-core';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // JSON-RPC initialize — return server capabilities
    if (body.method === 'initialize') {
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: 'path402',
            version: '1.3.2',
          },
        },
      });
    }

    // JSON-RPC tools/list — return all registered tools
    if (body.method === 'tools/list') {
      // Access registered tools from the server
      const tools = (server as any)._registeredTools;
      const toolList = tools
        ? Object.entries(tools).map(([name, def]: [string, any]) => ({
            name,
            description: def.description || '',
            inputSchema: def.inputSchema || { type: 'object', properties: {} },
          }))
        : [];

      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        result: { tools: toolList },
      });
    }

    // JSON-RPC tools/call — execute a tool
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params;
      const tools = (server as any)._registeredTools;
      const tool = tools?.[name];

      if (!tool) {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: `Tool not found: ${name}` },
        });
      }

      try {
        const result = await tool.callback(args || {});
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result,
        });
      } catch (toolError: any) {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [{ type: 'text', text: `Error: ${toolError.message}` }],
            isError: true,
          },
        });
      }
    }

    // Unknown method
    return Response.json({
      jsonrpc: '2.0',
      id: body.id ?? null,
      error: { code: -32601, message: `Method not found: ${body.method}` },
    });
  } catch (error: any) {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32603, message: error.message }, id: null },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
