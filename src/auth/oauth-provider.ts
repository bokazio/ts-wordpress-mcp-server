import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import axios from 'axios';
import { 
    OAUTH_AUTHORIZATION_URL,
    OAUTH_TOKEN_URL,
    OAUTH_REVOCATION_URL,
    OAUTH_CLIENT_SECRET,
    OAUTH_CLIENT_VERIFICATION_URL,
    OAUTH_CLIENT_ID
} from '../config/oauth-config.js';

/**
 * Initialize the OAuth provider for MCP
 * 
 * This provider proxies authentication requests to an external OAuth server
 */
export function createOAuthProvider(): ProxyOAuthServerProvider {
    const provider = new ProxyOAuthServerProvider({
        endpoints: {
            authorizationUrl: OAUTH_AUTHORIZATION_URL,
            tokenUrl: OAUTH_TOKEN_URL,
            revocationUrl: OAUTH_REVOCATION_URL,
        },
        // Verify access tokens against the external provider
        verifyAccessToken: async (token: string) => {
            try {
                console.log(`Verifying token with OAuth.com: ${token.substring(0, 10)}...`);
                
                // For OAuth.com playground, token introspection uses form data
                const params = new URLSearchParams();
                params.append('token', token);
                params.append('client_id', OAUTH_CLIENT_ID);
                params.append('client_secret', OAUTH_CLIENT_SECRET);
                
                // Call the external verification endpoint to validate the token
                const response = await axios.post(OAUTH_CLIENT_VERIFICATION_URL, params, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                
                console.log('Token verification response:', response.data);
                
                // Check if token is active (OAuth.com style)
                if (response.data && response.data.active === false) {
                    console.error('Token is not active');
                    throw new Error('Token is inactive or expired');
                }
                
                // Return token verification info
                // Note: expiresAt must be a number (timestamp in seconds), not a Date object
                return {
                    token,
                    clientId: response.data.client_id || OAUTH_CLIENT_ID || "unknown",
                    scopes: response.data.scope ? response.data.scope.split(' ') : ["openid", "email", "profile"],
                    // Convert expiration to a number (timestamp) - SDK expects expiresAt as a number
                    expiresAt: response.data.exp ? Number(response.data.exp) : undefined,
                    // Include user identification 
                    userId: response.data.sub || response.data.username,
                    email: response.data.email
                };
            } catch (error) {
                console.error('Error verifying token:', error);
                throw new Error('Invalid or expired token');
            }
        },
        // Get client information
        getClient: async (client_id: string) => {
            // You can fetch client information from a database or external service
            // For simplicity, we're returning standard configuration
            return {
                client_id,
                client_secret: OAUTH_CLIENT_SECRET,
                redirect_uris: [process.env.OAUTH_REDIRECT_URI || "http://localhost:3000/callback"],
                // Additional client properties as needed
                grant_types: ["authorization_code", "refresh_token"]
            };
        }
    });

    return provider;
}