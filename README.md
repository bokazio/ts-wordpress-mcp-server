# TypeScript WordPress MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js->=18.0.0-green)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.10.2-purple)](https://github.com/modelcontextprotocol/typescript-sdk)

A Model Context Protocol (MCP) server for WordPress content management that provides a secure interface for AI assistants to interact with WordPress sites. This implementation enables AI agents to work with WordPress content safely, without destructive operations like content deletion. It's ideal for content creation workflows, agentic automation, and AI-assisted content management.

The first intent of this project was to create a showcase implementation that supports all available MCP protocols in a single server. A primary goal was to build a secure implementation based on the official Model Context Protocol SDK, reveal best practices for MCP server development in Typescript and integration with external systems like WordPress. From time to time, the server will be updated to support new features and improvements in the MCP protocol.

The server now supports multiple transport methods including local stdio-based integration for AI assistants like GitHub Copilot and Claude Desktop, as well as remote methods: modern Streamable HTTP with OAuth2 (WIP - not in main branch) and legacy SSE transports with Bearer token authentication.

## Features

- **Secure Authentication**: OAuth2 integration for modern authentication flows (WIP/not successfully tested see branch `oauth2`)
- **Multiple Transport Methods**:
  - Streamable HTTP (current MCP protocol version)
  - Server-Sent Events (legacy support)
  - Stdio transport for command-line usage and AI assistant integration
- **WordPress Integration**: Manage posts, media, and site information
- **Content Management Tools**: Create, update, and search WordPress content
- **Media Management**: Upload and manage media files
- **Security-First Design**: Rate limiting, secure headers, and proper authentication
- **AI-Friendly Design**: Safe operations without destructive methods

## Table of Contents

- [TypeScript WordPress MCP Server](#typescript-wordpress-mcp-server)
  - [Features](#features)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
    - [Environment Variables](#environment-variables)
      - [Required WordPress Settings](#required-wordpress-settings)
      - [Server Settings](#server-settings)
      - [Transport Settings](#transport-settings)
      - [Legacy Authentication (SSE Transport Only)](#legacy-authentication-sse-transport-only)
  - [Usage](#usage)
    - [Starting the Server](#starting-the-server)
    - [Transport Options](#transport-options)
  - [Testing with MCP Inspector](#testing-with-mcp-inspector)
    - [Basic Testing Commands](#basic-testing-commands)
    - [Tool Discovery and Testing](#tool-discovery-and-testing)
  - [AI Assistant Integration](#ai-assistant-integration)
    - [GitHub Copilot Integration](#github-copilot-integration)
    - [Claude Desktop Integration](#claude-desktop-integration)
  - [Documentation](#documentation)
    - [Available Tools](#available-tools)
  - [Work in Progress](#work-in-progress)
  - [License](#license)

## Prerequisites

- Node.js 18.0.0 or higher
- A WordPress site with REST API enabled
- (Optional and WIP) OAuth provider for authentication

## Installation

1. Clone the repository:

```bash
git clone https://github.com/bokazio/ts-wordpress-mcp.git
cd ts-wordpress-mcp
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file based on the provided `.env.example`:

```bash
cp .env.example .env
```

Then edit the `.env` file to configure your server:

#### Required WordPress Settings

```bash
# WordPress API Connection
WORDPRESS_API_URL=https://your-wordpress-site.com/wp-json/wp/v2
WORDPRESS_AUTH_USER=your_wordpress_username
WORDPRESS_AUTH_PASS=your_application_password
```

> **Important**: For WordPress authentication, it's recommended to use [Application Passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) rather than your main account password.

#### Server Settings

```bash
# Server Configuration
PORT=3000                # Port for the MCP server

# Security Settings
MAX_FILE_SIZE_MB=50     # Maximum file size for uploads (MB)
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,webp
RATE_LIMIT=60           # Requests per minute per IP
```

#### Transport Settings

```bash
# MCP_TRANSPORT=stdio   # Uncomment to use stdio instead of HTTP
```

#### Legacy Authentication (SSE Transport Only)

```bash
# Bearer token for SSE transport authentication
MCP_AUTH_TOKEN=your_secure_token_here
```

## Usage

### Starting the Server

Start the server in development mode:

```bash
npm start
```

For production use:

```bash
npm run build
node dist/index.js
```

### Transport Options

The server supports three transport methods:

1. **Streamable HTTP Transport** (default, current protocol version)
   - Endpoint: `/mcp`
   - Methods: `GET`, `POST`, `DELETE`
   - OAuth authentication (actually without authentication! WIP see branch `oauth2`)

2. **SSE Transport** (legacy support)
   - Endpoints: `/sse` (GET) and `/messages` (POST)
   - Bearer token authentication

3. **Stdio Transport** (for command-line use)
   - Set `MCP_TRANSPORT=stdio` in `.env`

## Testing with MCP Inspector

You can test the MCP server using the MCP Inspector, a developer tool for testing and debugging MCP servers. Here are some example commands (don't forget to configure with the correct MCP_TRANSPORT) method before:

### Basic Testing Commands

For local testing with stdio transport:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

For testing with Streamable HTTP transport:

```bash
# Start your server first with: npm start
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

For testing with SSE transport:

```bash
# Start your server first with: npm start
npx @modelcontextprotocol/inspector http://localhost:3000/sse --transport sse
```

### Tool Discovery and Testing

List all available tools:

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

Get site information (example tool usage):

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call --tool-name getSiteInfo
```

Create a new post:

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call --tool-name createPost --tool-arg title="Test Post" --tool-arg content="<p>This is a test post created via MCP</p>" --tool-arg status="draft"
```

Then in the web UI:

1. Click "Connect to MCP Server"
2. Enter your server URL (e.g., `http://localhost:3000/mcp`) or use stdio connection
3. Select appropriate transport type (Streamable HTTP or Server-Sent Events)
4. Click "Connect"

## AI Assistant Integration

### GitHub Copilot Integration

To integrate this MCP server with GitHub Copilot, you'll need to configure your VS Code settings. Add the following to your VS Code `settings.json`:

```json
"mcp": {
  "servers": {
    "ts-wordpress-mcp-server": {
      "command": "node",
      "args": [
        "<path on your computer to this>/dist/index.js"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "WORDPRESS_API_URL": "https://<wp-domain>/wp-json/wp/v2",
        "WORDPRESS_AUTH_USER": "<wp-username>",
        "WORDPRESS_AUTH_PASS": "<wp-application-pass>"
      }
    }
  }
}
```

Replace the placeholders with your actual values:

- `<full-path-to>` - Full path to the ts-wordpress-mcp directory
- `<wp-domain>` - Your WordPress site domain
- `<wp-username>` - Your WordPress username
- `<wp-application-pass>` - Your WordPress application password

To access your VS Code settings.json:

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type "Preferences: Open User Settings (JSON)"
3. Click on the matching option

Remember to build the server with `npm run build` before using this configuration.

### Claude Desktop Integration

To integrate with Claude Desktop or other applications supporting MCP:

1. Build the server with `npm run build`
2. Configure Claude Desktop to use an MCP server with the following parameters:
  
```json
{
  "mcpServers": {
    "ts-wordpress-mcp-server": {
      "command": "node",
      "args": ["<full-path-to>/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "WORDPRESS_API_URL": "https://<wp-domain>/wp-json/wp/v2",
        "WORDPRESS_AUTH_USER": "<wp-username>",
        "WORDPRESS_AUTH_PASS": "<wp-application-pass>"
      }
    }
  }
}
```

Replace all placeholders with your actual values. The server will then be available to Claude for WordPress content management tasks.

## Documentation

The server implements the Model Context Protocol which allows AI assistants to interact with WordPress content in a structured way.

### Available Tools

- **WordPress Site Info Tool**: Get information about the WordPress site
- **Post Management Tools**: Create, update, search, and retrieve posts
- **Media Management Tools**: Upload and manage media files

## Work in Progress

The following features are currently under development or planned for future releases:

- **OAuth Integration**: Full implementation and testing of OAuth authentication for Streamable HTTP transport
- **Additional WordPress APIs**: Implementing more WordPress REST API endpoints and functionality:
  - Categories and tags management
  - User management
  - Comments handling
  - Custom post types support
- **Automated Testing**: Comprehensive test suite for all components
- **Advanced Media Handling**: Enhanced support for media libraries and galleries
- **Security Enhancements**: Additional security features and hardening
- **Documentation**: Complete API documentation and integration guides
- **Performance Optimization**: Caching and request optimization

Contributions are welcome! Feel free to submit pull requests or open issues for any of these areas.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

🔨 Forged with passion, caffeine, and a dash of open-source magic by [Jan Krüger](https://github.com/bokazio)
