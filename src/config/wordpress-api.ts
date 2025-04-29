// WordPress API client for making requests to WordPress API

import axios from 'axios';
import { WORDPRESS_API_URL, authHeader } from '../config/index.js';

// Create axios instance for WordPress API requests
export const axiosInstance = axios.create({
    baseURL: WORDPRESS_API_URL,
    headers: {
        'Content-Type': 'application/json',
        ...authHeader
    }
});

// Helper function to check if WordPress site is accessible and has content
export const checkWordPressSite = async () => {
    try {
        // Try to get basic site information
        const siteInfoResponse = await axios.get(`${WORDPRESS_API_URL.replace(/\/wp\/v2\/?$/, '')}`);
        
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
                    return { 
                        type, 
                        count: response.data?.length || 0,
                        available: true
                    };
                } catch (error: any) {
                    return { 
                        type, 
                        count: 0, 
                        available: false,
                        error: error.response?.status || 'Unknown error'
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
        console.error('Error checking WordPress site:', error);
        return {
            isAccessible: false,
            error: error.response?.status || 'Connection error',
            message: error.response?.data?.message || error.message
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
        ...authHeader,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
    };

    return axios.post(
        `${WORDPRESS_API_URL}/media`,
        buffer,
        {
            headers: mediaUploadHeaders,
            timeout: 60000, // 60 second timeout for large uploads
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        }
    );
};