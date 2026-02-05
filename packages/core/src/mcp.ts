/**
 * $402 MCP Server - Entry Point
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { server } from "./index.js";

async function runStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("$402 MCP server running on stdio");
}

async function runHTTP(): Promise<void> {
    const app = express();
    app.use(express.json());

    app.post("/mcp", async (req, res) => {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
        });
        res.on("close", () => transport.close());
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });

    const port = parseInt(process.env.PORT || "3402");
    app.listen(port, () => {
        console.error(`$402 MCP server running on http://localhost:${port}/mcp`);
    });
}

/**
 * Main entry point for the MCP server
 */
export async function runServer(): Promise<void> {
    const transport = process.env.TRANSPORT || "stdio";
    if (transport === "http") {
        await runHTTP();
    } else {
        await runStdio();
    }
}

// If this file is executed directly (not imported)
const isMain = process.argv[1]?.endsWith('mcp.js') || process.argv[1]?.endsWith('index.js');
if (isMain) {
    runServer().catch(error => {
        console.error("Fatal error in MCP server:", error);
        process.exit(1);
    });
}
