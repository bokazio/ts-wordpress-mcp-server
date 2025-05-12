/**
 * OAuth configuration for the MCP Server
 * 
 * This configuration is used to proxy authentication requests to an external OAuth server
 */
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// OAuth endpoint URLs from environment variables
export const OAUTH_AUTHORIZATION_URL = process.env.OAUTH_AUTHORIZATION_URL || 'https://auth.example.com/oauth2/v1/authorize';
export const OAUTH_TOKEN_URL = process.env.OAUTH_TOKEN_URL || 'https://auth.example.com/oauth2/v1/token';
export const OAUTH_REVOCATION_URL = process.env.OAUTH_REVOCATION_URL || 'https://auth.example.com/oauth2/v1/revoke';

// Client verification endpoint to validate tokens
export const OAUTH_CLIENT_VERIFICATION_URL = process.env.OAUTH_CLIENT_VERIFICATION_URL || 'https://auth.example.com/oauth2/v1/verify';

// OAuth client configuration
export const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'default-client-id';
export const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
export const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';

// Base URL for the MCP server
export const MCP_BASE_URL = process.env.MCP_BASE_URL || 'http://localhost:3000';

// Issuer URL (identifies who issued the token)
export const OAUTH_ISSUER_URL = process.env.OAUTH_ISSUER_URL || 'https://auth.example.com';

// Documentation URL for the MCP service
export const MCP_SERVICE_DOCUMENTATION_URL = process.env.MCP_SERVICE_DOCUMENTATION_URL || 'https://docs.example.com/';

// OAuth is enabled flag
export const OAUTH_ENABLED = process.env.OAUTH_ENABLED === 'true';

/**
 * Check if the OAuth configuration is valid
 * @returns boolean indicating if OAuth is properly configured
 */
export function hasValidOAuthConfig(): boolean {
    if (!OAUTH_ENABLED) {
        return false;
    }

    // Check if the minimum required variables are set
    return !!(
        OAUTH_AUTHORIZATION_URL &&
        OAUTH_TOKEN_URL &&
        OAUTH_CLIENT_ID &&
        OAUTH_CLIENT_VERIFICATION_URL
    );
}