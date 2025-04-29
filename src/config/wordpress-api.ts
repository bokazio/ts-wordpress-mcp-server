// WordPress API client for making requests to WordPress API

import axios, { AxiosHeaderValue, AxiosRequestHeaders, HeadersDefaults } from 'axios';
import http from 'http';
import https from 'https';
import { WORDPRESS_API_URL, getAuthHeader } from '../config/index.js';

// Create axios instance for WordPress API requests with improved configuration
export const axiosInstance = axios.create({
    baseURL: WORDPRESS_API_URL,
    headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
    },
    // Add connection pooling for better performance
    httpAgent: new http.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 10 }),
    httpsAgent: new https.Agent({ 
        keepAlive: true, 
        keepAliveMsecs: 1000, 
        maxSockets: 10,
        rejectUnauthorized: true // Enforce SSL certificate validation
    }),
    // Set reasonable timeouts
    timeout: 30000, // 30 seconds for standard requests
});

// Add request interceptor to refresh auth headers
axiosInstance.interceptors.request.use(config => {
    // Refresh auth header on each request to ensure it's always current
    const currentHeaders = config.headers || {};
    config.headers = {
        ...currentHeaders,
        ...getAuthHeader()
    } as AxiosRequestHeaders;
    return config;
});

// Add response interceptor for better error handling
axiosInstance.interceptors.response.use(
    response => response,
    async (error: any) => {
        if (error.response) {
            // Log only necessary information, not the entire error
            console.error(`API Error: ${error.response.status} ${error.response.statusText}`);
            console.error(`Endpoint: ${error.config?.url || 'unknown'}`);
            console.error(`Error details: ${JSON.stringify({
                code: error.response.data?.code,
                message: error.response.data?.message
            })}`);
        } else if (error.request) {
            console.error('Network error - no response received');
        } else {
            console.error(`Error setting up request: ${error.message}`);
        }
        throw error;
    }
);

// Helper function to check if WordPress site is accessible and has content
export const checkWordPressSite = async () => {
    try {
        // Try to get basic site information
        const siteInfoResponse = await axios.get(`${WORDPRESS_API_URL.replace(/\/wp\/v2\/?$/, '')}`, {
            headers: getAuthHeader(),
            timeout: 10000 // 10 seconds for health check
        });
        
        // Check various content types to see what's available
        const endpoints = [
            { type: 'posts', endpoint: '/posts' },
            { type: 'pages', endpoint: '/pages' },
            { type: 'media', endpoint: '/media' },
            { type: 'categories', endpoint: '/categories' },
            { type: 'tags', endpoint: '/tags' },
        ];
        
        const contentChecks = await Promise.all(
            endpoints.map(async ({ type, endpoint }) => {
                try {
                    const response = await axiosInstance.get(endpoint, { 
                        params: { per_page: '1' } 
                    });
                    // Safely get total count from headers
                    const totalCount = parseInt(response.headers['x-wp-total'] || '0', 10);
                    return { 
                        type, 
                        count: totalCount || response.data?.length || 0,
                        available: true
                    };
                } catch (error: any) {
                    const status = error.response?.status || 'Unknown';
                    return { 
                        type, 
                        count: 0, 
                        available: false,
                        error: status
                    };
                }
            })
        );
        
        return {
            site: siteInfoResponse.data || {},
            content: contentChecks,
            isAccessible: true
        };
    } catch (error: any) {
        // Safe error handling without exposing too much information
        const errorMessage = error.response?.data?.message || error.message;
        console.error('Error checking WordPress site:', {
            status: error.response?.status || 'Connection error',
            message: errorMessage
        });
        
        return {
            isAccessible: false,
            error: error.response?.status || 'Connection error',
            message: errorMessage
        };
    }
};

// Helper function for uploading media files with proper configuration
export const uploadMedia = async (
    buffer: Buffer,
    fileName: string,
    contentType: string
) => {
    const mediaUploadHeaders = {
        ...getAuthHeader(), // Get fresh auth headers
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
    };

    // Validate file size before upload
    const fileSizeMB = buffer.length / (1024 * 1024);
    const maxSizeMB = 50; // 50MB limit, adjust as needed
    
    if (fileSizeMB > maxSizeMB) {
        throw new Error(`File size exceeds the maximum allowed size of ${maxSizeMB}MB`);
    }

    return axios.post(
        `${WORDPRESS_API_URL}/media`,
        buffer,
        {
            headers: mediaUploadHeaders,
            timeout: 120000, // 2 minute timeout for large uploads
            maxContentLength: 52428800, // 50MB in bytes
            maxBodyLength: 52428800, // 50MB in bytes
            // Add connection pool agent for uploads too
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ 
                keepAlive: true,
                rejectUnauthorized: true // Enforce SSL certificate validation
            })
        }
    );
};