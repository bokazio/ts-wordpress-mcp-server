import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import express from 'express';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import axios from 'axios';
import { randomUUID } from 'node:crypto';

// --- Configuration ---
// Replace with your WordPress site URL and potentially authentication details
const WORDPRESS_API_URL = process.env.WORDPRESS_API_URL || 'YOUR_WORDPRESS_SITE_URL/wp-json/wp/v2';
// Basic Auth: Use Application Passwords plugin or similar for secure authentication
const WORDPRESS_AUTH_USER = process.env.WORDPRESS_AUTH_USER;
const WORDPRESS_AUTH_PASS = process.env.WORDPRESS_AUTH_PASS;

const authHeader = WORDPRESS_AUTH_USER && WORDPRESS_AUTH_PASS
    ? { Authorization: `Basic ${Buffer.from(`${WORDPRESS_AUTH_USER}:${WORDPRESS_AUTH_PASS}`).toString('base64')}` }
    : {};

const axiosInstance = axios.create({
    baseURL: WORDPRESS_API_URL,
    headers: {
        'Content-Type': 'application/json',
        ...authHeader
    }
});

// --- MCP Server Setup ---

// Map to store transports by session ID for stateful connections
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'WordPress MCP Server',
        version: '1.0.0',
        // Add capabilities if needed
    });

    // --- Tools ---

    // Tool: Create Post
    server.tool(
        'create_post',
        {
            title: z.string().describe('The title of the post.'),
            content: z.string().describe('The HTML content of the post.'),
            status: z.enum(['publish', 'pending', 'draft', 'private']).optional().default('draft').describe('The status of the post (publish, pending, draft, private). Defaults to draft.'),
        },
        async ({ title, content, status }) => {
            try {
                const response = await axiosInstance.post('/posts', {
                    title,
                    content,
                    status,
                });
                return {
                    content: [
                        { type: 'text', text: `Post created successfully with ID: ${response.data.id}. Status: ${response.data.status}. Link: ${response.data.link}` },
                    ],
                };
            } catch (error: any) {
                console.error('Error creating WordPress post:', error.response?.data || error.message);
                throw new Error(`Failed to create post: ${error.response?.data?.message || error.message}`);
            }
        }
    );

    // Tool: Update Post
    server.tool(
        'update_post',
        {
            search_term: z.string().describe('The title or keyword to search for the post to update.'),
            title: z.string().optional().describe('The new title for the post.'),
            content: z.string().optional().describe('The new HTML content for the post.'),
            status: z.enum(['publish', 'pending', 'draft', 'private']).optional().describe('The new status for the post.'),
        },
        async ({ search_term, title, content, status }) => {
            try {
                // 1. Search for the post
                const searchResponse = await axiosInstance.get('/posts', {
                    params: { search: search_term, per_page: 1 }, // Find the most relevant post
                });

                if (!searchResponse.data || searchResponse.data.length === 0) {
                    return { content: [{ type: 'text', text: `No post found matching '${search_term}'.` }] };
                }

                const postId = searchResponse.data[0].id;
                const postLink = searchResponse.data[0].link;
                const currentStatus = searchResponse.data[0].status;

                // 2. Prepare update data
                const updateData: { [key: string]: any } = {};
                if (title) updateData.title = title;
                if (content) updateData.content = content;
                if (status) updateData.status = status;

                if (Object.keys(updateData).length === 0) {
                    return { content: [{ type: 'text', text: `No updates specified for post ID ${postId}. Current status: ${currentStatus}. Link: ${postLink}` }] };
                }

                // 3. Update the post
                const updateResponse = await axiosInstance.post(`/posts/${postId}`, updateData);

                return {
                    content: [
                        { type: 'text', text: `Post ID ${postId} updated successfully. New Status: ${updateResponse.data.status}. Link: ${updateResponse.data.link}` },
                    ],
                };
            } catch (error: any) {
                console.error('Error updating WordPress post:', error.response?.data || error.message);
                throw new Error(`Failed to update post: ${error.response?.data?.message || error.message}`);
            }
        }
    );

    return server;
}

// --- Express App Setup ---
const app = express();
app.use(express.json());

// Handle MCP POST requests
app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    try {
        if (sessionId && transports[sessionId]) {
            // Reuse existing transport for the session
            transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
            // Create a new transport and server instance for a new session
            const newSessionId = randomUUID();
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => newSessionId,
                onsessioninitialized: (initSessionId) => {
                    transports[initSessionId] = transport; // Store transport when session starts
                    console.log(`MCP Session initialized: ${initSessionId}`);
                }
            });

            const server = createMcpServer(); // Create a new server instance for isolation

            // Clean up transport when closed
            transport.onclose = () => {
                if (transport.sessionId) {
                    delete transports[transport.sessionId];
                    console.log(`MCP Session closed: ${transport.sessionId}`);
                }
                server.close(); // Close the associated MCP server instance
            };

            await server.connect(transport);

        } else {
            // Invalid request (e.g., message without session ID before initialization)
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: Missing or invalid session ID, or not an Initialize request.',
                },
                id: req.body?.id ?? null,
            });
            return;
        }

        // Handle the MCP request using the appropriate transport
        await transport.handleRequest(req, res, req.body);

        // Ensure cleanup if the client disconnects unexpectedly
        res.on('close', () => {
            if (!res.writableEnded) {
                console.log(`Request closed unexpectedly for session: ${transport.sessionId}`);
                // Transport and server cleanup is handled by transport.onclose
            }
        });

    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error during MCP request handling.',
                },
                id: req.body?.id ?? null,
            });
        }
        // Attempt to close transport if an error occurred during setup/handling
        if (sessionId && transports[sessionId]) {
            transports[sessionId].close();
        }
    }
});

// Add basic GET/DELETE handlers to indicate method not allowed for /mcp
app.get('/mcp', (req: Request, res: Response) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method Not Allowed. Use POST for MCP requests.' },
        id: null
    });
});

app.delete('/mcp', (req: Request, res: Response) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method Not Allowed. Use POST for MCP requests.' },
        id: null
    });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WordPress MCP Server listening on port ${PORT}`);
    console.log(`Using WordPress API URL: ${WORDPRESS_API_URL}`);
    if (WORDPRESS_AUTH_USER) {
        console.log(`Using Basic Authentication for user: ${WORDPRESS_AUTH_USER}`);
    } else {
        console.warn('WordPress authentication not configured. API requests might fail if authentication is required.');
        console.warn('Set WORDPRESS_API_URL, WORDPRESS_AUTH_USER, and WORDPRESS_AUTH_PASS environment variables.');
    }
});
