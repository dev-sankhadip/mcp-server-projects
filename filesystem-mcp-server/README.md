````markdown
# Filesystem MCP Server

> A fully-featured [Model Context Protocol](https://modelcontextprotocol.io) server built with **TypeScript** that gives AI models (like Claude) the ability to read, write, and navigate your file system.

---

## What is MCP?

**Model Context Protocol (MCP)** is an open standard created by Anthropic that defines how AI models communicate with external tools and data sources. Think of it as a universal "plugin system" for AI — instead of every AI integration being custom-built, MCP provides a single, well-defined protocol.

```
┌─────────────────────┐      JSON-RPC 2.0       ┌─────────────────────────┐
│   AI Host           │ ◄─────────────────────► │   MCP Server (you)      │
│  (Claude Desktop,   │       over stdio         │  (this project)         │
│   Cursor, etc.)     │                          │                         │
└─────────────────────┘                          └─────────────────────────┘
```

### The Three Primitives

MCP servers expose three types of capabilities:

| Primitive    | Who invokes it? | What it does                                     | Example                          |
| ------------ | --------------- | ------------------------------------------------ | -------------------------------- |
| **Tool**     | The AI model    | Executes an action and returns a result          | `read_file`, `search_files`      |
| **Resource** | The AI model    | Provides readable content via a URI              | `file:///home/user/README.md`    |
| **Prompt**   | The human user  | A parameterized message template (slash-command) | `/review-file path=src/index.ts` |

### How a Tool Call Works

```
1. User:    "What's in the README?"
2. Claude:  (decides to use the read_file tool)
3. Claude → MCP Server:  { tool: "read_file", args: { path: "README.md" } }
4. MCP Server → Claude:  { content: [{ type: "text", text: "# My Project..." }] }
5. Claude → User:  "The README says this project is..."
```

---

## This Server's Capabilities

### Tools (6 total)

| Tool             | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `read_file`      | Read the text content of any file                    |
| `write_file`     | Write or append content to a file                    |
| `list_directory` | List files/folders in a directory (recursive option) |
| `search_files`   | Find files by name pattern (supports `*` wildcards)  |
| `get_file_info`  | Get metadata: size, type, MIME, timestamps           |
| `delete_file`    | Permanently delete a file                            |

### Resources

The server exposes well-known files in the current directory as readable resources with `file://` URIs. You can also request **any** file by its URI dynamically.

- `file:///path/to/README.md`
- `file:///path/to/package.json`
- `file:///path/to/some/directory/` ← trailing slash = directory listing

### Prompts (Slash Commands)

| Prompt                 | Arguments                | Description                                       |
| ---------------------- | ------------------------ | ------------------------------------------------- |
| `/review-file`         | `path`, `focus?`         | Code review with optional focus (security, perf…) |
| `/summarize-directory` | `path`                   | Explain a project's structure and purpose         |
| `/find-and-explain`    | `filename`, `directory?` | Find a file and explain what it does              |

---

## Project Structure

```
filesystem-mcp-server/
├── src/
│   ├── index.ts       ← Entry point: wires server + handlers together
│   ├── tools.ts       ← All 6 tool definitions + handlers
│   ├── resources.ts   ← Resource listing + file:// URI reader
│   └── prompts.ts     ← 3 prompt templates with argument schemas
├── dist/              ← Compiled JavaScript (after npm run build)
├── package.json
├── tsconfig.json
└── README.md          ← You are here
```

### Key Files Explained

#### `src/index.ts`

The main server. It:

1. Creates a `Server` instance with declared capabilities
2. Registers a **request handler** for each MCP method (`tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`)
3. Connects the server to a `StdioServerTransport` and starts listening

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone or navigate to the project
cd filesystem-mcp-server

# Install dependencies
npm install

# Build TypeScript → JavaScript
npm run build
```

### Running Manually (Test Mode)

You can test the server by piping JSON-RPC messages to it:

```bash
# Start the server
node dist/index.js

# In another terminal, send a test request:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

---

## Connecting to Claude Desktop

Claude Desktop can run MCP servers automatically. Add this to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/absolute/path/to/filesystem-mcp-server/dist/index.js"],
      "env": {}
    }
  }
}
```

> Replace `/absolute/path/to/` with the actual path on your machine.

After saving, **restart Claude Desktop**. You'll see a 🔌 icon in the chat interface indicating the server is connected.

---

## Example Interactions

Once connected to Claude Desktop, you can ask Claude things like:

```
"List all TypeScript files in my project"
→ Claude calls search_files({ directory: ".", pattern: "*.ts" })

"What does the tsconfig.json file contain?"
→ Claude calls read_file({ path: "tsconfig.json" })

"Create a todo.txt with today's tasks"
→ Claude calls write_file({ path: "todo.txt", content: "..." })

"How big is the dist/ folder?"
→ Claude calls list_directory({ path: "dist", recursive: true })
   then get_file_info for summary
```

---

## Development

```bash
# Watch mode — recompiles on every save
npm run dev

# Clean compiled output
npm run clean

# Full rebuild
npm run clean && npm run build
```

---

## License

MIT
````
