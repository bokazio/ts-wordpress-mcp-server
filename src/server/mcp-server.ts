// MCP Server implementation for WordPress

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createPostTool, updatePostTool, searchPostTool, getPostTool } from '../tools/post-tools.js';
import { uploadMediaTool } from '../tools/media-tools.js';
import { wordPressSiteInfoTool } from '../tools/site-info-tool.js';

// Create a new MCP server with WordPress tools
export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'WordPress MCP Server',
        version: '1.0.0',
        description: 'A server for managing WordPress posts via the Model Context Protocol.'
    });

    // Register WordPress site information tool
    server.tool(
        wordPressSiteInfoTool.name,
        wordPressSiteInfoTool.description,
        wordPressSiteInfoTool.parameters,
        wordPressSiteInfoTool.handler
    );

    // Register post management tools
    server.tool(
        searchPostTool.name,
        searchPostTool.description,
        searchPostTool.parameters,
        searchPostTool.handler
    );

    server.tool(
        createPostTool.name,
        createPostTool.description,
        createPostTool.parameters,
        createPostTool.handler
    );

    server.tool(
        updatePostTool.name,
        updatePostTool.description,
        updatePostTool.parameters,
        updatePostTool.handler
    );

    server.tool(
        getPostTool.name,
        getPostTool.description,
        getPostTool.parameters,
        getPostTool.handler
    );

    // Register media management tools
    server.tool(
        uploadMediaTool.name,
        uploadMediaTool.description,
        uploadMediaTool.parameters,
        uploadMediaTool.handler
    );

    return server;
}