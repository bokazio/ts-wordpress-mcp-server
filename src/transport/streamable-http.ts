// Implementation of the Streamable HTTP transport for MCP

import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { MCP_PROTOCOL_VERSION_CURRENT } from '../config/index.js';
import { createMcpServer } from '../server/mcp-server.js';

// Store for all active Streamable HTTP transports
export const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Handle Streamable HTTP requests for the MCP protocol
 */
export async function handleStreamableHttpRequest(req: Request, res: Response): Promise<void> {
    console.log(`Received ${req.method} request to /mcp`);

    // Add MCP protocol version to response headers
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION_CURRENT);

    try {
        // Get session ID from header
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        let transport: StreamableHTTPServerTransport;

        if (sessionId && streamableTransports[sessionId]) {
            // Reuse existing transport for the session
            console.log(`Using existing transport for session ${sessionId}`);
            transport = streamableTransports[sessionId];
        } else if (req.method === 'POST' && !sessionId) {
            // Check if this is an initialization request
            const isInitReq = isInitializeRequest(req.body);
            console.log('Is initialize request:', isInitReq);

            // Manual validation as fallback for initialize requests
            const isManuallyValidated =
                req.body?.jsonrpc === '2.0' &&
                req.body?.method === 'initialize' &&
                req.body?.params?.client_name &&
                req.body?.params?.client_version &&
                req.body?.id !== undefined;

            if (isInitReq || isManuallyValidated) {
                console.log('Initialize request received:', JSON.stringify(req.body));

                // Create event store for resumability with the Streamable HTTP transport
                const eventStore = new InMemoryEventStore();

                // Create a new transport for a new session
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    eventStore,
                    onsessioninitialized: (initSessionId) => {
                        // Store transport when session is initialized
                        streamableTransports[initSessionId] = transport;
                        console.log(`MCP Session initialized: ${initSessionId}`);
                    }
                });

                // Set up cleanup when transport is closed
                transport.onclose = () => {
                    if (transport.sessionId) {
                        delete streamableTransports[transport.sessionId];
                        console.log(`MCP Session closed: ${transport.sessionId}`);
                    }
                };

                // Create and connect to a new MCP server instance
                const server = createMcpServer();
                await server.connect(transport);
            } else {
                // Not a valid initialize request
                console.log('Invalid request: Not an initialization request and no session ID');
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Bad Request: Not an initialization request and missing session ID',
                    },
                    id: req.body?.id ?? null,
                });
                return;
            }
        } else {
            // Other invalid cases (like expired session ID)
            const errorMessage = sessionId
                ? `Bad Request: Session ID ${sessionId} not found`
                : `Bad Request: Missing session ID (Method: ${req.method})`;

            console.log(errorMessage);
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: errorMessage,
                },
                id: req.body?.id ?? null,
            });
            return;
        }

        // Handle the request with the appropriate transport
        await transport.handleRequest(req, res, req.method === 'POST' ? req.body : undefined);

        // Set up cleanup for unexpected disconnections
        res.on('close', () => {
            if (!res.writableEnded) {
                console.log(`Request closed unexpectedly for session: ${transport.sessionId}`);
            }
        });

    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: req.body?.id ?? null,
            });
        }
    }
}

/**
 * Close all Streamable HTTP transports on server shutdown
 */
export async function closeAllStreamableTransports(): Promise<void> {
    for (const sessionId in streamableTransports) {
        try {
            console.log(`Closing Streamable HTTP transport for session ${sessionId}`);
            await streamableTransports[sessionId].close();
            delete streamableTransports[sessionId];
        } catch (error) {
            console.error(`Error closing Streamable HTTP transport for session ${sessionId}:`, error);
        }
    }
}