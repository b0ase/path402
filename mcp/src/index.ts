#!/usr/bin/env node
/**
 * $402 MCP Server - npm entry point
 *
 * This re-exports the MCP server from @b0ase/path402-core
 * Published as 'path402' to npm
 */

// Re-export everything from core's MCP server
export * from '@b0ase/path402-core';

// If run directly, start the MCP server
import('@b0ase/path402-core/mcp' as any).then(mcp => {
  if (mcp.runServer) {
    mcp.runServer().catch((err: any) => {
      console.error("MCP Server failed:", err);
      process.exit(1);
    });
  }
});
