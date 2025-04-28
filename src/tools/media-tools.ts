// WordPress Media management tools for MCP

import { z } from 'zod';
import { axiosInstance, uploadMedia } from '../config/wordpress-api.js';

// Tool to upload media to WordPress
export const uploadMediaTool = {
    name: 'upload_media',
    description: 'Upload a media file to the WordPress media library.',
    parameters: {
        file_content: z.string().describe('Base64 encoded content of the file to upload.'),
        file_name: z.string().describe('Name of the file including extension (e.g., image.jpg).'),
        title: z.string().optional().describe('Title for the media item.'),
        caption: z.string().optional().describe('Caption for the media item.'),
        alt_text: z.string().optional().describe('Alternative text for the media item.'),
        description: z.string().optional().describe('Description for the media item.')
    },
    handler: async ({ file_content, file_name, title, caption, alt_text, description }: {
        file_content: string;
        file_name: string;
        title?: string;
        caption?: string;
        alt_text?: string;
        description?: string;
    }) => {
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

            // Upload the media file
            const uploadResponse = await uploadMedia(buffer, file_name, contentType);

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
                        type: "text" as const,
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
};