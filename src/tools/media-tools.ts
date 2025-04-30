// WordPress Media management tools for MCP

import { z } from 'zod';
import { axiosInstance, uploadMedia } from '../config/wordpress-api.js';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_MB } from '../config/index.js';

// Improved tool to upload media to WordPress with better validation
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
    annotations: {
        destructiveHint: true, // This tool creates new content
        openWorldHint: true, // Interacts with an external WordPress system
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
            // Validate file extension
            const fileExtension = file_name.split('.').pop()?.toLowerCase() || '';
            
            if (!ALLOWED_FILE_TYPES.includes(fileExtension)) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Error: Unsupported file type: ${fileExtension}. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`
                        }
                    ],
                    isError: true // Indicate tool execution error
                };
            }

            // Securely decode the base64 content with error handling
            let buffer: Buffer;
            try {
                buffer = Buffer.from(file_content, 'base64');
            } catch (error) {
                return {
                    content: [
                        { type: "text" as const, text: `Error: Invalid file content. The content must be base64 encoded.` }
                    ],
                    isError: true // Indicate tool execution error
                };
            }

            // Log the file size for debugging (without exposing content)
            const fileSizeMB = buffer.length / (1024 * 1024);
            console.log(`Uploading file: ${file_name}, size: ${fileSizeMB.toFixed(2)} MB`);

            // Check file size against configured limit
            if (fileSizeMB > MAX_FILE_SIZE_MB) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Error: File size (${fileSizeMB.toFixed(2)} MB) exceeds the maximum allowed size of ${MAX_FILE_SIZE_MB} MB`
                        }
                    ],
                    isError: true // Indicate tool execution error
                };
            }

            // Determine content type based on file extension
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
                'webp': 'image/webp',
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
                data: {
                    id: mediaId,
                    url: uploadResponse.data.source_url,
                    title: uploadResponse.data.title?.rendered || title,
                    mime_type: uploadResponse.data.mime_type
                }
            };
        } catch (error: any) {
            // More user-friendly error handling that doesn't expose sensitive information
            console.error('Error uploading media to WordPress:');
            
            let errorMessage = 'Failed to upload media';
            let statusCode = 'unknown';
            
            if (error.response) {
                statusCode = error.response.status;
                errorMessage = error.response.data?.message || 
                              `Server returned error code ${statusCode}`;
            } else if (error.request) {
                errorMessage = 'No response received from server. Please check your connection.';
            } else {
                errorMessage = error.message || errorMessage;
            }
            
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error uploading media: ${errorMessage}`
                    }
                ],
                isError: true // Indicate tool execution error
            };
        }
    }
};