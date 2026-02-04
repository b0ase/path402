#!/usr/bin/env node
/**
 * $402 MCP Server - npm entry point
 *
 * This re-exports the MCP server from @path402/core
 * Published as 'path402' to npm
 */

// Re-export everything from core's MCP server
export * from '@path402/core';

// If run directly, start the MCP server
import('@path402/core').then(core => {
  // The core index.ts handles stdio transport setup
});
