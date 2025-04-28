import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import express from 'express';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';

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

// MCP Protocol Versions
const MCP_PROTOCOL_VERSION_CURRENT = '2025-03-26'; // Current version (Streamable HTTP)
const MCP_PROTOCOL_VERSION_LEGACY = '2024-11-05';  // Legacy version (HTTP+SSE)

// --- MCP Server Setup ---

// Store transports for each session type
const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>
};

function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'WordPress MCP Server',
        version: '1.0.0',
        description: 'A server for managing WordPress posts via the Model Context Protocol.'
    });

    // --- Tools ---

    // Tool: Create Post
    server.tool(
        'create_post',
        'Create a new WordPress post with specified title, content, and optional status.',
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
        'Update an existing WordPress post by searching for it and modifying its properties.',
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

    // Tool: Upload Media
    server.tool(
        'upload_media',
        'Upload a media file to the WordPress media library.',
        {
            file_content: z.string().describe('Base64 encoded content of the file to upload.'),
            file_name: z.string().describe('Name of the file including extension (e.g., image.jpg).'),
            title: z.string().optional().describe('Title for the media item.'),
            caption: z.string().optional().describe('Caption for the media item.'),
            alt_text: z.string().optional().describe('Alternative text for the media item.'),
            description: z.string().optional().describe('Description for the media item.')
        },
        async ({ file_content, file_name, title, caption, alt_text, description }) => {
            try {
                // Decode the base64 content
                const buffer = Buffer.from(file_content, 'base64');
                
                // Log the file size for debugging
                console.log(`Uploading file: ${file_name}, size: ${buffer.length / 1024} KB`);
                
                // Determine content type based on file extension
                const fileExtension = file_name.split('.').pop()?.toLowerCase() || '';
                const contentTypeMap: { [key: string]: string } = {
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'gif': 'image/gif',
                    'pdf': 'application/pdf',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'mp3': 'audio/mpeg',
                    'mp4': 'video/mp4',
                };
                
                const contentType = contentTypeMap[fileExtension] || 'application/octet-stream';
                
                // Create a custom instance for this request with different headers and timeout
                const mediaUploadHeaders = {
                    ...authHeader,
                    'Content-Type': contentType,
                    'Content-Disposition': `attachment; filename="${file_name}"`,
                };
                
                // Configure axios for file upload with increased timeout and max size
                const uploadResponse = await axios.post(
                    `${WORDPRESS_API_URL}/media`,
                    buffer,
                    { 
                        headers: mediaUploadHeaders,
                        timeout: 60000, // 60 second timeout for large uploads
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity
                    }
                );
                
                const mediaId = uploadResponse.data.id;
                
                // If additional metadata is provided, update the media item
                if (title || caption || alt_text || description) {
                    const metadataUpdate: { [key: string]: any } = {};
                    if (title) metadataUpdate.title = title;
                    if (caption) metadataUpdate.caption = caption;
                    if (alt_text) metadataUpdate.alt_text = alt_text;
                    if (description) metadataUpdate.description = description;
                    
                    await axiosInstance.post(`/media/${mediaId}`, metadataUpdate);
                }
                
                return {
                    content: [
                        { 
                            type: 'text', 
                            text: `Media uploaded successfully with ID: ${mediaId}. URL: ${uploadResponse.data.source_url}`
                        },
                    ],
                };
            } catch (error: any) {
                // Provide more detailed error information
                console.error('Error uploading media to WordPress:');
                
                if (error.response) {
                    // The request was made and the server responded with a status code
                    console.error(`Status: ${error.response.status}`);
                    console.error('Response data:', error.response.data);
                    console.error('Response headers:', error.response.headers);
                } else if (error.request) {
                    // The request was made but no response was received
                    console.error('No response received:', error.request);
                } else {
                    // Something happened in setting up the request
                    console.error('Error message:', error.message);
                }
                
                throw new Error(`Failed to upload media: ${error.response?.data?.message || error.message}`);
            }
        }
    );

    return server;
}

// --- Server Start ---

// Determine transport mode based on environment variable
const useStdio = process.env.MCP_TRANSPORT?.toLowerCase() === 'stdio';

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
    // --- Express App Setup ---
    console.log('Starting WordPress MCP Server...');
    const app = express();
    
    // Configure Express to handle larger payloads
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    //=============================================================================
    // MODERN STREAMABLE HTTP TRANSPORT (PROTOCOL VERSION 2025-03-26)
    //=============================================================================

    // Handle all MCP requests (POST, GET, DELETE)
    app.all('/mcp', async (req: Request, res: Response) => {
        console.log(`Received ${req.method} request to /mcp`);
        
        // Add MCP protocol version to response headers
        res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION_CURRENT);
        
        // Get session ID from header
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        
        try {
            // Log incoming request for debugging
            if (req.method === 'POST') {
                console.log('Request body:', JSON.stringify(req.body, null, 2));
            }
            
            let transport: StreamableHTTPServerTransport;
            
            if (sessionId && transports.streamable[sessionId]) {
                // Reuse existing transport for the session
                console.log(`Using existing transport for session ${sessionId}`);
                transport = transports.streamable[sessionId];
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
                            transports.streamable[initSessionId] = transport;
                            console.log(`MCP Session initialized: ${initSessionId}`);
                        }
                    });
                    
                    // Set up cleanup when transport is closed
                    transport.onclose = () => {
                        if (transport.sessionId) {
                            delete transports.streamable[transport.sessionId];
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
    });

    //=============================================================================
    // DEPRECATED HTTP+SSE TRANSPORT (PROTOCOL VERSION 2024-11-05)
    //=============================================================================

    // Legacy SSE endpoint for older clients
    app.get('/sse', async (req: Request, res: Response) => {
        console.log('Received GET request to /sse (deprecated SSE transport)');
        
        // Add legacy protocol version to response headers
        res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION_LEGACY);
        
        // Create SSE transport for legacy clients
        const transport = new SSEServerTransport('/messages', res);
        transports.sse[transport.sessionId] = transport;
        
        // Clean up transport when connection is closed
        res.on("close", () => {
            delete transports.sse[transport.sessionId];
            console.log(`SSE transport closed for session ${transport.sessionId}`);
        });
        
        const server = createMcpServer();
        await server.connect(transport);
    });

    // Legacy message endpoint for older clients
    app.post("/messages", async (req: Request, res: Response) => {
        const sessionId = req.query.sessionId as string;
        
        // Add legacy protocol version to response headers
        res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION_LEGACY);
        
        const transport = transports.sse[sessionId];
        if (transport) {
            try {
                // Handle the message properly - SSEServerTransport no longer has receiveMessage
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
    });

    // --- Start Server ---
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`WordPress MCP Server listening on port ${PORT}`);
        console.log(`
==============================================
SUPPORTED TRANSPORT OPTIONS:

1. Streamable Http (Protocol version: ${MCP_PROTOCOL_VERSION_CURRENT})
   Endpoint: /mcp
   Methods: GET, POST, DELETE
   Usage: 
     - Initialize with POST to /mcp
     - Establish SSE stream with GET to /mcp
     - Send requests with POST to /mcp
     - Terminate session with DELETE to /mcp

2. Http + SSE (Protocol version: ${MCP_PROTOCOL_VERSION_LEGACY}) [DEPRECATED]
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
    });

    // Handle server shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down server...');

        // Close all active transports to properly clean up resources
        for (const sessionId in transports.streamable) {
            try {
                console.log(`Closing Streamable HTTP transport for session ${sessionId}`);
                await transports.streamable[sessionId].close();
                delete transports.streamable[sessionId];
            } catch (error) {
                console.error(`Error closing Streamable HTTP transport for session ${sessionId}:`, error);
            }
        }

        // Close any active SSE transports
        for (const sessionId in transports.sse) {
            try {
                console.log(`Closing SSE transport for session ${sessionId}`);
                await transports.sse[sessionId].close();
                delete transports.sse[sessionId];
            } catch (error) {
                console.error(`Error closing SSE transport for session ${sessionId}:`, error);
            }
        }
        
        console.log('Server shutdown complete');
        process.exit(0);
    });
}
