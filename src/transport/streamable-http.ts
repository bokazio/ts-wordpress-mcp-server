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

// Session management - track session creation times for cleanup
const sessionTimes: Record<string, number> = {};

// Session timeout (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Clean up expired sessions periodically
 */
function setupSessionCleanup() {
    setInterval(async () => {
        const now = Date.now();
        for (const sessionId in sessionTimes) {
            if (now - sessionTimes[sessionId] > SESSION_TIMEOUT_MS) {
                try {
                    console.log(`Cleaning up expired session ${sessionId}`);
                    await closeTransport(sessionId);
                } catch (error) {
                    console.error(`Error cleaning up session ${sessionId}:`, error);
                }
            }
        }
    }, 5 * 60 * 1000); // Check every 5 minutes
}

// Start session cleanup
setupSessionCleanup();

/**
 * Close and clean up a transport
 */
async function closeTransport(sessionId: string): Promise<void> {
    if (streamableTransports[sessionId]) {
        try {
            await streamableTransports[sessionId].close();
        } catch (error) {
            console.error(`Error closing transport for session ${sessionId}:`, error);
        }
        delete streamableTransports[sessionId];
        delete sessionTimes[sessionId];
        console.log(`Closed transport for session ${sessionId}`);
    }
}

/**
 * Handle Streamable HTTP requests for the MCP protocol
 */
export async function handleStreamableHttpRequest(req: Request, res: Response): Promise<void> {
    // Add MCP protocol version to response headers
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION_CURRENT);
    
    // Track request start time for logging
    const requestStartTime = Date.now();
    const requestId = randomUUID().substring(0, 8);
    console.log(`[${requestId}] Received ${req.method} request to /mcp`);

    try {
        // MCP endpoint does not require bearer token authentication
        // Get session ID from header
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // For DELETE requests, handle session termination
        if (req.method === 'DELETE' && sessionId) {
            if (streamableTransports[sessionId]) {
                await closeTransport(sessionId);
                res.status(200).json({
                    jsonrpc: '2.0',
                    result: { message: 'Session terminated successfully' },
                    id: null
                });
            } else {
                res.status(404).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: `Session ID ${sessionId} not found`
                    },
                    id: null
                });
            }
            return;
        }

        let transport: StreamableHTTPServerTransport;

        if (sessionId && streamableTransports[sessionId]) {
            // Reuse existing transport for the session
            console.log(`[${requestId}] Using existing transport for session ${sessionId}`);
            transport = streamableTransports[sessionId];
            
            // Update session time to keep it alive
            sessionTimes[sessionId] = Date.now();
        } else if (req.method === 'POST' && !sessionId) {
            // Check if this is an initialization request with enhanced validation
            let isInitReq = false;
            try {
                isInitReq = isInitializeRequest(req.body);
            } catch (error) {
                console.error(`[${requestId}] Error validating initialization request:`, error);
            }
            
            // Additional manual validation to be more robust
            const isManuallyValidated =
                req.body?.jsonrpc === '2.0' &&
                req.body?.method === 'initialize' &&
                req.body?.params?.client_name &&
                req.body?.params?.client_version &&
                req.body?.id !== undefined;

            if (isInitReq || isManuallyValidated) {
                console.log(`[${requestId}] Initialize request received from client: ${req.body?.params?.client_name || 'unknown'}`);

                // Create event store for resumability with the Streamable HTTP transport
                const eventStore = new InMemoryEventStore();

                // Create a new transport for a new session with better error handling
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    eventStore,
                    onsessioninitialized: (initSessionId) => {
                        // Store transport when session is initialized
                        streamableTransports[initSessionId] = transport;
                        sessionTimes[initSessionId] = Date.now();
                        console.log(`[${requestId}] MCP Session initialized: ${initSessionId}`);
                    }
                });

                // Set up cleanup when transport is closed
                transport.onclose = () => {
                    if (transport.sessionId) {
                        closeTransport(transport.sessionId)
                            .catch(err => console.error(`Error in onclose for session ${transport.sessionId}:`, err));
                    }
                };

                // Create and connect to a new MCP server instance
                const server = createMcpServer();
                await server.connect(transport);
            } else {
                // Not a valid initialize request
                console.log(`[${requestId}] Invalid request: Not an initialization request and no session ID`);
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
                ? `Bad Request: Session ID ${sessionId} not found or expired`
                : `Bad Request: Missing session ID (Method: ${req.method})`;

            console.log(`[${requestId}] ${errorMessage}`);
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
                console.log(`[${requestId}] Request closed unexpectedly for session: ${transport.sessionId}`);
            }
            
            // Log request completion time
            const requestDuration = Date.now() - requestStartTime;
            console.log(`[${requestId}] Request completed in ${requestDuration}ms`);
        });

    } catch (error) {
        console.error(`[${requestId}] Error handling MCP request:`, error);
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
    console.log(`Closing ${Object.keys(streamableTransports).length} active Streamable HTTP transports`);
    
    const closePromises = Object.keys(streamableTransports).map(async (sessionId) => {
        try {
            await closeTransport(sessionId);
            return true;
        } catch (error) {
            console.error(`Error closing Streamable HTTP transport for session ${sessionId}:`, error);
            return false;
        }
    });
    
    await Promise.all(closePromises);
}