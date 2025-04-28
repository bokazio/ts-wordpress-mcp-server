// WordPress Post management tools for MCP

import { z } from 'zod';
import { axiosInstance } from '../config/wordpress-api.js';

// Tool to create a new WordPress post
export const createPostTool = {
    name: 'create_post',
    description: 'Create a new WordPress post with specified title, content, and optional status.',
    parameters: {
        title: z.string().describe('The title of the post.'),
        content: z.string().describe('The HTML content of the post.'),
        status: z.enum(['publish', 'pending', 'draft', 'private']).optional().default('draft')
            .describe('The status of the post (publish, pending, draft, private). Defaults to draft.'),
    },
    handler: async ({ title, content, status }: {
        title: string;
        content: string;
        status?: 'publish' | 'pending' | 'draft' | 'private'
    }) => {
        try {
            const response = await axiosInstance.post('/posts', {
                title,
                content,
                status,
            });
            return {
                content: [
                    { type: "text" as const, text: `Post created successfully with ID: ${response.data.id}. Status: ${response.data.status}. Link: ${response.data.link}` },
                ],
            };
        } catch (error: any) {
            console.error('Error creating WordPress post:', error.response?.data || error.message);
            throw new Error(`Failed to create post: ${error.response?.data?.message || error.message}`);
        }
    }
};

// Tool to update an existing WordPress post
export const updatePostTool = {
    name: 'update_post',
    description: 'Update an existing WordPress post by searching for it and modifying its properties.',
    parameters: {
        search_term: z.string().describe('The title or keyword to search for the post to update.'),
        title: z.string().optional().describe('The new title for the post.'),
        content: z.string().optional().describe('The new HTML content for the post.'),
        status: z.enum(['publish', 'pending', 'draft', 'private']).optional()
            .describe('The new status for the post.'),
    },
    handler: async ({ search_term, title, content, status }: {
        search_term: string;
        title?: string;
        content?: string;
        status?: 'publish' | 'pending' | 'draft' | 'private';
    }) => {
        try {
            // 1. Search for the post
            const searchResponse = await axiosInstance.get('/posts', {
                params: { search: search_term, per_page: 1 }, // Find the most relevant post
            });

            if (!searchResponse.data || searchResponse.data.length === 0) {
                return {
                    content: [
                        { type: "text" as const, text: `No post found matching '${search_term}'.` }
                    ]
                };
            }

            const postId = searchResponse.data[0].id;
            const postLink = searchResponse.data[0].link;
            const currentStatus = searchResponse.data[0].status;

            // 2. Prepare update data
            const updateData: { [key: string]: any } = {};
            if (title) updateData.title = title;
            if (content) updateData.content = content;
            if (status) updateData.status = status;

            if (Object.keys(updateData).length === 0) {
                return {
                    content: [
                        { type: "text" as const, text: `No updates specified for post ID ${postId}. Current status: ${currentStatus}. Link: ${postLink}` }
                    ]
                };
            }

            // 3. Update the post
            const updateResponse = await axiosInstance.post(`/posts/${postId}`, updateData);

            return {
                content: [
                    { type: "text" as const, text: `Post ID ${postId} updated successfully. New Status: ${updateResponse.data.status}. Link: ${updateResponse.data.link}` },
                ],
            };
        } catch (error: any) {
            console.error('Error updating WordPress post:', error.response?.data || error.message);
            throw new Error(`Failed to update post: ${error.response?.data?.message || error.message}`);
        }
    }
};