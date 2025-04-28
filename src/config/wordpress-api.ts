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