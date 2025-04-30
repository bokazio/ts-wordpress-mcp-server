// WordPress Site information tool for MCP

import { z } from 'zod';
import { checkWordPressSite } from '../config/wordpress-api.js';

// Tool to get WordPress site information
export const wordPressSiteInfoTool = {
    name: 'wordpress_site_info',
    description: 'Get information about the WordPress site, including available content types and API status.',
    parameters: {},
    annotations: {
        readOnlyHint: true, // This tool only reads data, doesn't modify anything
        openWorldHint: true, // Interacts with an external WordPress system
    },
    handler: async () => {
        try {
            const siteInfo = await checkWordPressSite();
            
            if (!siteInfo.isAccessible) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `⚠️ WordPress site is not accessible.\nError: ${siteInfo.error}\nMessage: ${siteInfo.message}\n\nPlease check your WordPress API URL and credentials.`
                        }
                    ],
                    isError: true // Indicate tool execution error
                };
            }
            
            // Format site information
            const name = siteInfo.site.name || 'Unknown';
            const description = siteInfo.site.description || 'No description';
            const url = siteInfo.site.url || 'Unknown URL';
            
            // Format content availability information
            const contentStatus = (siteInfo.content || []).map(item => 
                `${item.type}: ${item.available ? `Available (${item.count} items)` : `Not available (Error: ${item.error})`}`
            ).join('\n');
            
            // Format namespaces information if available
            const namespaces = siteInfo.site.namespaces ? 
                `\nSupported Namespaces: ${siteInfo.site.namespaces.join(', ')}` : '';
            
            const hasContent = (siteInfo.content || []).some(item => item.count > 0);
            
            return {
                content: [
                    { 
                        type: "text" as const, 
                        text: `WordPress Site Information:
                        
Site Name: ${name}
Description: ${description}
URL: ${url}${namespaces}

Content Availability:
${contentStatus}

${!hasContent ? 
'⚠️ No content found in the WordPress site. You may need to create some content first or check API permissions.' : 
''}

WordPress API version: ${siteInfo.site.gmt_offset ? 'Standard WP REST API' : 'Unknown'}
Authentication: ${Object.keys(siteInfo.site).includes('authentication') ? 'Required' : 'Not required or already authenticated'}`
                    }
                ],
                data: siteInfo
            };
        } catch (error: any) {
            console.error('Error getting WordPress site information:', error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Failed to get WordPress site information: ${error.message}`
                    }
                ],
                isError: true // Indicate tool execution error
            };
        }
    }
};