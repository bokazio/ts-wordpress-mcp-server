// Configuration for the MCP WordPress server

import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// MCP Protocol Versions
export const MCP_PROTOCOL_VERSION_CURRENT = '2025-03-26'; // Current version (Streamable HTTP)
export const MCP_PROTOCOL_VERSION_LEGACY = '2024-11-05';  // Legacy version (HTTP+SSE)

// WordPress API configuration
export const WORDPRESS_API_URL = process.env.WORDPRESS_API_URL || 'YOUR_WORDPRESS_SITE_URL/wp-json/wp/v2';

// Authentication details
export const WORDPRESS_AUTH_USER = process.env.WORDPRESS_AUTH_USER;
export const WORDPRESS_AUTH_PASS = process.env.WORDPRESS_AUTH_PASS;

// Create authentication header for WordPress API requests
export const authHeader = WORDPRESS_AUTH_USER && WORDPRESS_AUTH_PASS
    ? { Authorization: `Basic ${Buffer.from(`${WORDPRESS_AUTH_USER}:${WORDPRESS_AUTH_PASS}`).toString('base64')}` }
    : {};

// Server configuration
export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Transport mode
export const useStdio = process.env.MCP_TRANSPORT?.toLowerCase() === 'stdio';