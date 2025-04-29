// WordPress Post management tools for MCP

import { z } from 'zod';
import { axiosInstance } from '../config/wordpress-api.js';

// Tool to search for WordPress posts
export const searchPostTool = {
    name: 'search_post',
    description: 'Search for WordPress posts by title or content and return post IDs and information.',
    parameters: {
        search_term: z.string().describe('The title or keyword to search for posts.'),
        per_page: z.number().optional().default(5).describe('Number of results to return (default: 5)'),
        status: z.enum(['any', 'publish', 'draft', 'pending', 'private']).optional().default('any')
            .describe('Status of posts to search for. Default is "any" which includes all statuses.'),
    },
    handler: async ({ search_term, per_page = 5, status = 'any' }: {
        search_term: string;
        per_page?: number;
        status?: 'any' | 'publish' | 'draft' | 'pending' | 'private';
    }) => {
        try {
            console.log(`Searching for posts with term: "${search_term}", per_page: ${per_page}, status: ${status}`);
            console.log(`WordPress API URL: ${axiosInstance.defaults.baseURL}`);
            
            // Search for posts, including draft posts
            const searchParams: any = {
                search: search_term,
                per_page: per_page.toString()
            };
            
            // Add status parameter if not set to 'any'
            if (status !== 'any') {
                searchParams.status = status;
            } else {
                // For 'any', include all possible statuses
                searchParams.status = ['publish', 'draft', 'pending', 'private'].join(',');
            }
            
            console.log(`Search parameters:`, searchParams);
            
            // Search for posts
            const searchResponse = await axiosInstance.get('/posts', {
                params: searchParams
            });
            
            console.log(`Search response received, status: ${searchResponse.status}`);
            console.log(`Response data type: ${typeof searchResponse.data}, is array: ${Array.isArray(searchResponse.data)}`);
            console.log(`Found ${searchResponse.data?.length || 0} posts`);
            
            // If no results, try a direct check for draft posts to confirm they exist
            if (Array.isArray(searchResponse.data) && searchResponse.data.length === 0) {
                console.log('No posts found with search, checking for all draft posts...');
                
                const draftResponse = await axiosInstance.get('/posts', {
                    params: { status: 'draft', per_page: '5' }
                });
                
                console.log(`Draft check - found ${draftResponse.data?.length || 0} draft posts`);
                
                if (draftResponse.data?.length > 0) {
                    console.log('Draft posts exist but search is not matching them');
                    
                    // If there are drafts but search didn't find them, show the drafts instead
                    const posts = draftResponse.data.map((post: any) => ({
                        id: post.id,
                        title: post.title?.rendered || post.title || '[No title]',
                        status: post.status || 'unknown',
                        link: post.link || '#',
                        date: post.date || 'unknown'
                    }));
                    
                    const postListText = posts.map((post: any) => 
                        `ID: ${post.id} | Title: ${post.title} | Status: ${post.status} | Date: ${post.date}`
                    ).join('\n');
                    
                    return {
                        content: [
                            { type: "text" as const, text: `No posts matched your search term "${search_term}", but found ${posts.length} draft posts:\n\n${postListText}` }
                        ],
                        data: { posts }
                    };
                }
            }
            
            if (!searchResponse.data || searchResponse.data.length === 0) {
                return { 
                    content: [
                        { type: "text" as const, text: `No posts found matching '${search_term}' with status=${status}. 
                        
If you have draft posts, make sure to set status="draft" or status="any" to include them in the search.` }
                    ] 
                };
            }

            // Format the results with careful property access
            const posts = searchResponse.data.map((post: any) => ({
                id: post.id,
                title: post.title?.rendered || post.title || '[No title]',
                status: post.status || 'unknown',
                link: post.link || '#',
                date: post.date || 'unknown'
            }));
            
            const postListText = posts.map((post: any) => 
                `ID: ${post.id} | Title: ${post.title} | Status: ${post.status} | Date: ${post.date}`
            ).join('\n');

            console.log(`Formatted ${posts.length} posts successfully`);
            
            return {
                content: [
                    { type: "text" as const, text: `Found ${posts.length} posts matching '${search_term}' with status=${status}:\n\n${postListText}` }
                ],
                data: { posts }
            };
        } catch (error: any) {
            console.error('Error searching WordPress posts:', error);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', JSON.stringify(error.response.data));
                console.error('Response headers:', JSON.stringify(error.response.headers));
            }
            throw new Error(`Failed to search posts: ${error.response?.data?.message || error.message}`);
        }
    }
};

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
    description: 'Update an existing WordPress post by ID.',
    parameters: {
        post_id: z.number().describe('The ID of the post to update.'),
        title: z.string().optional().describe('The new title for the post.'),
        content: z.string().optional().describe('The new HTML content for the post.'),
        status: z.enum(['publish', 'pending', 'draft', 'private']).optional()
            .describe('The new status for the post.'),
    },
    handler: async ({ post_id, title, content, status }: {
        post_id: number;
        title?: string;
        content?: string;
        status?: 'publish' | 'pending' | 'draft' | 'private';
    }) => {
        try {
            // Prepare update data
            const updateData: { [key: string]: any } = {};
            if (title) updateData.title = title;
            if (content) updateData.content = content;
            if (status) updateData.status = status;

            if (Object.keys(updateData).length === 0) {
                return { 
                    content: [
                        { type: "text" as const, text: `No updates specified for post ID ${post_id}.` }
                    ] 
                };
            }

            // Update the post
            const updateResponse = await axiosInstance.post(`/posts/${post_id}`, updateData);

            return {
                content: [
                    { type: "text" as const, text: `Post ID ${post_id} updated successfully. New Status: ${updateResponse.data.status}. Link: ${updateResponse.data.link}` },
                ],
            };
        } catch (error: any) {
            console.error('Error updating WordPress post:', error.response?.data || error.message);
            throw new Error(`Failed to update post: ${error.response?.data?.message || error.message}`);
        }
    }
};

// Tool to get a specific WordPress post by ID
export const getPostTool = {
    name: 'get_post',
    description: 'Get a specific WordPress post by ID and return its content, title, and other fields.',
    parameters: {
        post_id: z.number().describe('The ID of the post to retrieve.'),
    },
    handler: async ({ post_id }: { post_id: number }) => {
        try {
            console.log(`Retrieving post with ID: ${post_id}`);
            
            // Get the post by ID
            const response = await axiosInstance.get(`/posts/${post_id}`);
            
            if (!response.data) {
                return {
                    content: [
                        { type: "text" as const, text: `No post found with ID: ${post_id}` }
                    ]
                };
            }
            
            // Extract post data
            const post = response.data;
            
            // Format the content fields, handling potential rendering issues
            const title = post.title?.rendered || post.title || '[No title]';
            const content = post.content?.rendered || post.content || '[No content]';
            const excerpt = post.excerpt?.rendered || post.excerpt || '';
            
            // Format date fields
            const date = post.date || 'unknown';
            const modified = post.modified || 'unknown';
            
            // Create formatted display of post information
            const postDetails = `
## Post Details (ID: ${post.id})

**Title:** ${title}
**Status:** ${post.status || 'unknown'}
**Published:** ${date}
**Last Modified:** ${modified}
**Link:** ${post.link || '#'}

### Content
${content}

### Excerpt
${excerpt}

### Additional Info
- Author ID: ${post.author || 'unknown'}
- Featured Media ID: ${post.featured_media || 'none'}
- Format: ${post.format || 'standard'}
- Categories: ${(post.categories || []).join(', ') || 'none'}
- Tags: ${(post.tags || []).join(', ') || 'none'}
`;
            
            // Return formatted post data
            return {
                content: [
                    { type: "text" as const, text: postDetails }
                ],
                data: {
                    post: {
                        id: post.id,
                        title,
                        content,
                        excerpt,
                        status: post.status,
                        date,
                        modified,
                        link: post.link,
                        author: post.author,
                        featured_media: post.featured_media,
                        categories: post.categories,
                        tags: post.tags
                    }
                }
            };
        } catch (error: any) {
            console.error('Error getting WordPress post:', error);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', JSON.stringify(error.response.data));
                
                // Handle 404 specifically
                if (error.response.status === 404) {
                    return {
                        content: [
                            { type: "text" as const, text: `Post with ID ${post_id} not found. The post may have been deleted or you may not have permission to access it.` }
                        ]
                    };
                }
            }
            throw new Error(`Failed to get post: ${error.response?.data?.message || error.message}`);
        }
    }
};