// Implementation of the SSE transport for MCP (legacy support)

import { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { MCP_PROTOCOL_VERSION_LEGACY } from '../config/index.js';
import { createMcpServer } from '../server/mcp-server.js';

// Store for all active SSE transports
export const sseTransports: Record<string, SSEServerTransport> = {};

/**
 * Handle SSE GET requests for establishing a connection
 */
export async function handleSseConnection(req: Request, res: Response): Promise<void> {
    console.log('Received GET request to /sse (deprecated SSE transport)');

    // Add legacy protocol version to response headers
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION_LEGACY);

    // Create SSE transport for legacy clients
    const transport = new SSEServerTransport('/messages', res);
    sseTransports[transport.sessionId] = transport;

    // Clean up transport when connection is closed
    res.on("close", () => {
        delete sseTransports[transport.sessionId];
        console.log(`SSE transport closed for session ${transport.sessionId}`);
    });

    const server = createMcpServer();
    await server.connect(transport);
}

/**
 * Handle SSE POST requests for JSON-RPC messages
 */
export async function handleSseMessage(req: Request, res: Response): Promise<void> {
    const sessionId = req.query.sessionId as string;

    // Add legacy protocol version to response headers
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION_LEGACY);

    const transport = sseTransports[sessionId];
    if (transport) {
        try {
            // Handle the message using the SSE transport
            await transport.handlePostMessage(req, res, req.body);
        } catch (error) {
            console.error('Error processing message:', error);
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: req.body.id,
            });
        }
    } else {
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Bad Request: No valid session found for sessionId',
            },
            id: req.body.id,
        });
    }
}

/**
 * Close all SSE transports on server shutdown
 */
export async function closeAllSseTransports(): Promise<void> {
    for (const sessionId in sseTransports) {
        try {
            console.log(`Closing SSE transport for session ${sessionId}`);
            await sseTransports[sessionId].close();
            delete sseTransports[sessionId];
        } catch (error) {
            console.error(`Error closing SSE transport for session ${sessionId}:`, error);
        }
    }
}