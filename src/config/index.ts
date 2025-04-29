// Configuration for the MCP WordPress server

import dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables from .env file
dotenv.config();

// MCP Protocol Versions
export const MCP_PROTOCOL_VERSION_CURRENT = '2025-03-26'; // Current version (Streamable HTTP)
export const MCP_PROTOCOL_VERSION_LEGACY = '2024-11-05';  // Legacy version (HTTP+SSE)

// WordPress API configuration
export const WORDPRESS_API_URL = process.env.WORDPRESS_API_URL || 'YOUR_WORDPRESS_SITE_URL/wp-json/wp/v2';

// Authentication details
export const WORDPRESS_AUTH_USER = process.env.WORDPRESS_AUTH_USER;
export const WORDPRESS_AUTH_PASS = process.env.WORDPRESS_AUTH_PASS;

// More secure function to generate the auth header with timestamp
export function getAuthHeader() {
    if (!WORDPRESS_AUTH_USER || !WORDPRESS_AUTH_PASS) {
        return {};
    }
    
    try {
        // Use a more secure approach for credentials
        const credentials = `${WORDPRESS_AUTH_USER}:${WORDPRESS_AUTH_PASS}`;
        const encoded = Buffer.from(credentials).toString('base64');
        
        // Add request timestamp to help prevent replay attacks when used with HTTPS
        const timestamp = Date.now().toString();
        
        return { 
            'Authorization': `Basic ${encoded}`,
            'X-Request-Timestamp': timestamp
        };
    } catch (error) {
        console.error('Error generating auth header:', error);
        return {};
    }
}

// Server configuration
export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Transport mode
export const useStdio = process.env.MCP_TRANSPORT?.toLowerCase() === 'stdio';

// Security settings
export const MAX_FILE_SIZE_MB = process.env.MAX_FILE_SIZE_MB ? 
    parseInt(process.env.MAX_FILE_SIZE_MB, 10) : 50; // Default 50MB

export const ALLOWED_FILE_TYPES = (process.env.ALLOWED_FILE_TYPES || 
    'jpg,jpeg,png,gif,pdf,doc,docx,mp3,mp4').split(',').map(type => type.trim());

// Rate limiting defaults (requests per minute)
export const RATE_LIMIT = process.env.RATE_LIMIT ? 
    parseInt(process.env.RATE_LIMIT, 10) : 60;