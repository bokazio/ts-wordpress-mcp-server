/**
 * WordPress MCP Server
 * 
 * A Model Context Protocol server for WordPress content management.
 * Supports both modern Streamable HTTP and legacy SSE transports.
 */

import express from 'express';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    useStdio,
    PORT,
    WORDPRESS_API_URL,
    WORDPRESS_AUTH_USER
} from './config/index.js';
import { createMcpServer } from './server/mcp-server.js';
import {
    handleStreamableHttpRequest,
    closeAllStreamableTransports
} from './transport/streamable-http.js';
import {
    handleSseConnection,
    handleSseMessage,
    closeAllSseTransports
} from './transport/sse.js';

// --- Server Start ---

// If MCP_TRANSPORT is 'stdio', use StdioServerTransport
if (useStdio) {
    const server = createMcpServer();
    const stdioTransport = new StdioServerTransport();

    // Connect the server to stdio
    server.connect(stdioTransport).catch(error => {
        console.error('Failed to connect MCP server to stdio transport:', error);
        process.exit(1);
    });

    // Use stderr for logging to avoid interfering with protocol messages on stdout
    console.error('WordPress MCP Server started in stdio mode (MCP_TRANSPORT=stdio)');
    console.error(`Using WordPress API URL: ${WORDPRESS_API_URL}`);
    if (WORDPRESS_AUTH_USER) {
        console.error(`Using Basic Authentication for user: ${WORDPRESS_AUTH_USER}`);
    } else {
        console.error('WordPress authentication not configured. API requests might fail if authentication is required.');
    }
} else {
    // --- Express App Setup for HTTP mode ---
    console.log('Starting WordPress MCP Server in HTTP mode...');
    const app = express();

    // Configure Express to handle larger payloads
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    //=============================================================================
    // MODERN STREAMABLE HTTP TRANSPORT (PROTOCOL VERSION 2025-03-26)
    //=============================================================================

    // Handle all MCP requests (POST, GET, DELETE) with the Streamable HTTP transport
    app.all('/mcp', handleStreamableHttpRequest);

    //=============================================================================
    // DEPRECATED HTTP+SSE TRANSPORT (PROTOCOL VERSION 2024-11-05)
    //=============================================================================

    // Legacy SSE endpoint for older clients
    app.get('/sse', handleSseConnection);

    // Legacy message endpoint for older clients
    app.post("/messages", handleSseMessage);

    // --- Start Server ---
    app.listen(PORT, () => {
        printServerStartupInfo();
    });

    // Handle server shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down server...');

        // Close all active transports to properly clean up resources
        await Promise.all([
            closeAllStreamableTransports(),
            closeAllSseTransports()
        ]);

        console.log('Server shutdown complete');
        process.exit(0);
    });
}

/**
 * Print server startup information and usage instructions
 */
function printServerStartupInfo() {
    console.log(`WordPress MCP Server listening on port ${PORT}`);
    console.log(`
==============================================
SUPPORTED TRANSPORT OPTIONS:

1. Streamable Http (Protocol version: 2025-03-26)
   Endpoint: /mcp
   Methods: GET, POST, DELETE
   Usage: 
     - Initialize with POST to /mcp
     - Establish SSE stream with GET to /mcp
     - Send requests with POST to /mcp
     - Terminate session with DELETE to /mcp

2. Http + SSE (Protocol version: 2024-11-05) [DEPRECATED]
   Endpoints: /sse (GET) and /messages (POST)
   Usage:
     - Establish SSE stream with GET to /sse
     - Send requests with POST to /messages?sessionId=<id>
==============================================
`);
    console.log(`Using WordPress API URL: ${WORDPRESS_API_URL}`);

    if (WORDPRESS_AUTH_USER) {
        console.log(`Using Basic Authentication for user: ${WORDPRESS_AUTH_USER}`);
    } else {
        console.warn('WordPress authentication not configured. API requests might fail if authentication is required.');
        console.warn('Set WORDPRESS_API_URL, WORDPRESS_AUTH_USER, and WORDPRESS_AUTH_PASS environment variables.');
    }
}
