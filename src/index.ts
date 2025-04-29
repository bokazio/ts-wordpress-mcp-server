/**
 * WordPress MCP Server
 * 
 * A Model Context Protocol server for WordPress content management.
 * Supports both modern Streamable HTTP and legacy SSE transports.
 */

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    useStdio,
    PORT,
    WORDPRESS_API_URL,
    WORDPRESS_AUTH_USER,
    RATE_LIMIT
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
        console.error(`Using Authentication for user: ${WORDPRESS_AUTH_USER}`);
    } else {
        console.error('WordPress authentication not configured. API requests might fail if authentication is required.');
    }
} else {
    // --- Express App Setup for HTTP mode ---
    console.log('Starting WordPress MCP Server in HTTP mode...');
    const app = express();

    // Security middleware with Helmet
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            }
        },
        xssFilter: true,
        noSniff: true,
        referrerPolicy: { policy: 'same-origin' }
    }));

    // Set security headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        next();
    });

    // Rate limiting
    const apiLimiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: RATE_LIMIT, // Configurable request limit
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many requests from this IP, please try again after a minute'
    });
    app.use(apiLimiter);

    // Configure Express to handle larger payloads but with size limits
    app.use(express.json({ 
        limit: '10mb', 
        type: ['application/json', 'application/json-rpc'] 
    }));
    app.use(express.urlencoded({ 
        limit: '10mb', 
        extended: true 
    }));

    // Add request logging middleware
    app.use((req, res, next) => {
        // Don't log the entire body for privacy/security reasons
        console.log(`${new Date().toISOString()} | ${req.method} ${req.url} | IP: ${req.ip}`);
        next();
    });

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

    // Add error handling middleware
    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('Express error handler caught:', err);
        
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Internal server error'
                    // Don't expose details of the error in production
                },
                id: null
            });
        }
    });

    // --- Start Server ---
    const server = app.listen(PORT, () => {
        printServerStartupInfo();
    });

    // Set timeout for the server
    server.timeout = 120000; // 2 minutes

    // Handle server shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down server...');

        // Close all active transports to properly clean up resources
        await Promise.all([
            closeAllStreamableTransports(),
            closeAllSseTransports()
        ]);

        // Close the HTTP server
        server.close(() => {
            console.log('Server shutdown complete');
            process.exit(0);
        });

        // Force exit after 5 seconds if graceful shutdown fails
        setTimeout(() => {
            console.log('Forcing shutdown after timeout');
            process.exit(1);
        }, 5000);
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
        console.log(`Using Authentication for user: ${WORDPRESS_AUTH_USER}`);
    } else {
        console.warn('WordPress authentication not configured. API requests might fail if authentication is required.');
        console.warn('Set WORDPRESS_API_URL, WORDPRESS_AUTH_USER, and WORDPRESS_AUTH_PASS environment variables.');
    }
}
