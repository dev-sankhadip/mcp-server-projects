# MCP Servers Monorepo

A monorepo containing multiple Model Context Protocol (MCP) servers, each providing specialized capabilities for AI integration.

## 📦 Packages

### `packages/filesystem-server`

A filesystem operations MCP server that exposes file system operations as AI-callable tools.

**Tools:**

- `read_file` — Read file contents
- `write_file` — Write/append to files
- `list_directory` — List directory contents
- `search_files` — Search for files by pattern
- `get_file_info` — Get file metadata
- `delete_file` — Delete files

**Resources:**

- Static resources (README, package.json, etc.)
- Template resources for file URIs

**Prompts:**

- `review-file` — Code review analysis
- `summarize-directory` — Directory structure overview
- `find-and-explain` — Find and explain files

[→ Filesystem Server README](./packages/filesystem-server/README.md)

---

### `packages/code-analyzer-server`

A code analysis MCP server that analyzes TypeScript/JavaScript codebases.

**Tools:**

- `scan_project` — Index all files, extract functions/exports/imports
- `explain_file` — Detailed file breakdown
- `find_pattern` — Regex search across code
- `get_metrics` — Code metrics and statistics
- `suggest_refactor` — AI-powered refactoring suggestions

**Resources:**

- Project summary
- File analysis details (template)
- Metrics snapshots (template)

**Prompts:**

- `analyze-codebase` — Architectural analysis
- `explain-code` — Code explanation
- `audit-project` — Security/quality audit

[→ Code Analyzer README](./packages/code-analyzer-server/README.md)

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18.0.0
- npm 10+ (supports workspaces)

### Installation

Install dependencies across all packages:

```bash
npm install
```

This uses npm workspaces to manage dependencies centrally.

### Building

Build all packages:

```bash
npm run build
```

Build a specific package:

```bash
npm run build -w @mcp-servers/filesystem-server
```

### Development

Watch mode for all packages:

```bash
npm run dev
```

Watch mode for a specific package:

```bash
npm run dev -w @mcp-servers/code-analyzer-server
```

### Cleaning

Clean all dist folders and node_modules:

```bash
npm run clean
```

---

## 🧪 Testing Servers

Each server can be tested with the MCP Inspector:

### Filesystem Server

```bash
npx @modelcontextprotocol/inspector node packages/filesystem-server/dist/index.js
```

### Code Analyzer Server

```bash
npx @modelcontextprotocol/inspector node packages/code-analyzer-server/dist/index.js
```

---

## 📁 Project Structure

```
mcp-server-projects/
├── packages/
│   ├── filesystem-server/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tools.ts
│   │   │   ├── resources.ts
│   │   │   └── prompts.ts
│   │   ├── dist/          (compiled)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   └── code-analyzer-server/
│       ├── src/
│       │   ├── index.ts
│       │   ├── analyzer.ts
│       │   ├── tools.ts
│       │   ├── resources.ts
│       │   └── prompts.ts
│       ├── dist/          (compiled)
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
│
├── package.json           (root, manages workspaces)
├── tsconfig.base.json     (shared compiler options)
├── .gitignore
└── README.md              (this file)
```

---

## 🔒 Configuration

### `tsconfig.base.json`

Shared TypeScript configuration extended by each package. Contains common compiler options like `ES2022` target, `Node16` module resolution, strict mode, etc.

Each package's `tsconfig.json` extends this base and adds package-specific paths:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

### Workspace Configuration

The root `package.json` uses npm workspaces:

```json
{
  "workspaces": ["packages/*"]
}
```

This enables:

- Single `npm install` for all dependencies
- Symlinked local packages
- Automatic dependency resolution between packages
- Unified script execution across all packages

---

## 📝 Adding a New Server

To add a new MCP server:

1. Create a new directory in `packages/`:

   ```bash
   mkdir packages/your-new-server
   cd packages/your-new-server
   ```

2. Create `package.json` with:

   ```json
   {
     "name": "@mcp-servers/your-new-server",
     "version": "1.0.0",
     "main": "dist/index.js",
     "scripts": {
       "build": "tsc",
       "dev": "tsc --watch",
       "start": "node dist/index.js",
       "clean": "rm -rf dist"
     },
     "dependencies": {
       "@modelcontextprotocol/sdk": "^1.0.0",
       "zod": "^3.22.0"
     },
     "devDependencies": {
       "@types/node": "^22.0.0",
       "typescript": "^5.7.0"
     }
   }
   ```

3. Create `tsconfig.json` extending the base config (see pattern above)

4. Create `src/index.ts`, `src/tools.ts`, `src/resources.ts`, `src/prompts.ts`

5. Run `npm install` from the root to link all dependencies

---

## 🤝 Integration with Claude

Register servers in Claude Desktop at `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": [
        "/path/to/mcp-server-projects/packages/filesystem-server/dist/index.js"
      ]
    },
    "codeAnalyzer": {
      "command": "node",
      "args": [
        "/path/to/mcp-server-projects/packages/code-analyzer-server/dist/index.js"
      ]
    }
  }
}
```

Restart Claude Desktop, and both servers will be available in your chats.

---

## 📚 Resources

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [npm Workspaces Documentation](https://docs.npmjs.com/cli/v10/using-npm/workspaces)

---

## 📄 License

MIT
