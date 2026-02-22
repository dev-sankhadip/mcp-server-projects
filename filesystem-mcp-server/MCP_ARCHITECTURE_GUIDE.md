# MCP Architecture & Engineering Guide

> Everything you need to design, architect, and build your own MCP server from scratch.

---

## Table of Contents

1. [What MCP Actually Is](#1-what-mcp-actually-is)
2. [Transport Layer](#2-transport-layer)
3. [Server Lifecycle](#3-server-lifecycle)
4. [The Three Primitives](#4-the-three-primitives)
   - [Tools](#41-tools--what-the-ai-can-do)
   - [Resources](#42-resources--what-the-ai-can-read)
   - [Prompts](#43-prompts--what-the-user-can-invoke)
5. [Architecture Patterns](#5-architecture-patterns)
6. [Error Handling](#6-error-handling)
7. [Configuration & Environment](#7-configuration--environment)
8. [Security Model](#8-security-model)
9. [Sampling — AI Calling AI](#9-sampling--ai-calling-ai)
10. [Architect's Decision Framework](#10-architects-decision-framework)
11. [Project Ideas to Build](#11-project-ideas-to-build)
12. [Key Takeaways](#12-key-takeaways)

---

## 1. What MCP Actually Is

### The Protocol

MCP is **JSON-RPC 2.0 over a transport**. Strip away everything — SDKs, abstractions, Claude — and this is what it is at the wire level.

Every message on the wire is one of exactly three shapes:

```jsonc
// 1. REQUEST — expects a response back, has an "id"
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "read_file", "arguments": { "path": "README.md" } }
}

// 2. RESPONSE (success) — reply to a request, carries the result
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "# My Project..." }]
  }
}

// 3. RESPONSE (error) — reply to a request, carries the error
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,         // standard JSON-RPC error codes
    "message": "File not found",
    "data": { "path": "README.md" }
  }
}

// 4. NOTIFICATION — fire-and-forget, no "id", no reply expected
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": { "level": "info", "data": "Server started" }
}
```

### Why This Matters for Engineering

Because you can **debug any MCP server with zero tooling**:

```bash
# Send a raw JSON-RPC request and see the raw response
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js

# Pipe multiple requests
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | node dist/index.js
```

The SDK handles framing and routing — but knowing the raw protocol means you are never dependent on the SDK to understand what's happening.

### Standard JSON-RPC Error Codes

| Code   | Meaning          | When to use                         |
| ------ | ---------------- | ----------------------------------- |
| -32700 | Parse error      | Invalid JSON received               |
| -32600 | Invalid request  | JSON-RPC structure is wrong         |
| -32601 | Method not found | Called a method you didn't register |
| -32602 | Invalid params   | Arguments don't match the schema    |
| -32603 | Internal error   | Unexpected server failure           |

---

## 2. Transport Layer

The transport is the **channel** through which JSON-RPC bytes travel. MCP is transport-agnostic — you can swap the transport without changing any business logic.

### StdioServerTransport (default)

The host (Claude Desktop) **spawns your server as a child process** and communicates through the process's stdin and stdout.

```
Claude Desktop
    │
    ├── spawns:  node /path/to/dist/index.js
    │
    │   stdin  ──────────────────────────►  Your server (reads JSON-RPC)
    │   stdout ◄──────────────────────────  Your server (writes JSON-RPC)
    │   stderr   (ignored by host — safe for your logs)
```

**The most critical rule with stdio transport:**

> **NEVER write anything to `process.stdout` yourself.**
> Every byte on stdout is part of the JSON-RPC stream.
> A stray `console.log()` will corrupt it and the host will disconnect.

Safe logging pattern:

```typescript
// ❌ WRONG — corrupts the JSON-RPC stream
console.log("Server started");

// ✅ CORRECT — stderr is ignored by the host, safe for logs
process.stderr.write("[my-server] Server started\n");

// ✅ ALSO CORRECT — use a logger wired to stderr
import { createWriteStream } from "fs";
const log = createWriteStream("/tmp/my-server.log", { flags: "a" });
log.write("Server started\n");
```

### SSEServerTransport (HTTP)

Used when you want a **remote** or **web-accessible** MCP server. The host connects over HTTP instead of spawning a local process.

```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();
const transport = new SSEServerTransport("/messages", res);
await server.connect(transport);
```

Use SSE transport when:

- Your server needs to run on a remote machine
- Multiple clients connect to the same server process
- You need auth (OAuth, API keys) at the HTTP layer

### Custom Transport

If you need WebSockets, named pipes, or IPC — implement the `Transport` interface:

```typescript
interface Transport {
  start(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
}
```

---

## 3. Server Lifecycle

Understanding the handshake sequence is essential for debugging connection issues.

```
Claude Desktop                          Your MCP Server
      │                                       │
      ├── spawn process ───────────────────► │ process starts, server.connect() called
      │                                       │
      │──── initialize ──────────────────►   │
      │     {                                 │
      │       protocolVersion: "2024-11-05",  │
      │       capabilities: {                 │
      │         roots: { listChanged: true }, │
      │         sampling: {}                  │ ← what the HOST offers
      │       },                              │
      │       clientInfo: { name, version }   │
      │     }                                 │
      │                                       │
      │   ◄──── initialized ─────────────────┤
      │     {                                 │
      │       protocolVersion: "2024-11-05",  │
      │       capabilities: {                 │
      │         tools: {},                    │
      │         resources: {},                │ ← what YOUR SERVER offers
      │         prompts: {}                   │
      │       },                              │
      │       serverInfo: { name, version }   │
      │     }                                 │
      │                                       │
      │──── tools/list ──────────────────►   │
      │   ◄──── { tools: [...] } ────────────┤
      │                                       │
      │──── resources/list ──────────────►   │
      │   ◄──── { resources: [...] } ────────┤
      │                                       │
      │──── prompts/list ────────────────►   │
      │   ◄──── { prompts: [...] } ──────────┤
      │                                       │
      │      (Claude is now fully aware       │
      │       of all server capabilities)     │
      │                                       │
      │  [user types a message...]            │
      │                                       │
      │──── tools/call ──────────────────►   │
      │   ◄──── { content: [...] } ──────────┤
      │                                       │
      │  [process ends when Claude Desktop    │
      │   quits or config is reloaded]        │
```

### Capability Negotiation

The `capabilities` object in `initialize` controls what each side is allowed to request:

```typescript
// Declare your server's capabilities at construction time
const server = new Server(
  { name: "my-server", version: "1.0.0" },
  {
    capabilities: {
      tools: {}, // I serve tools — host may call tools/list + tools/call
      resources: {
        subscribe: true, // I support resource change subscriptions
        listChanged: true, // I'll notify when resource list changes
      },
      prompts: {}, // I serve prompts
      logging: {}, // I accept logging/setLevel requests
    },
  },
);
```

If you declare `tools: {}` but not `resources: {}`, the host will never call `resources/list`. Only declare what you implement.

---

## 4. The Three Primitives

### 4.1 Tools — "What the AI can DO"

Tools are **functions the AI model invokes autonomously** to take actions or retrieve information. The model decides whether and when to call a tool based entirely on its `description` and the `inputSchema`.

**This makes writing descriptions the most important engineering skill in MCP.**

#### Full Tool Anatomy

```typescript
const myTool: ToolDefinition = {
  // ── Identity ──────────────────────────────────────────────────────────
  name: "search_database",
  // Used in: tools/call { name: "search_database", arguments: {...} }
  // Convention: snake_case verbs. clear and specific.

  // ── Description ───────────────────────────────────────────────────────
  description: `
    Search the customer database for records matching a query string.
    Use this when the user asks to find customers, look up records,
    or filter data. Supports partial name matches and email lookups.
    Returns up to 'limit' results sorted by relevance.
    Do NOT use this for writing or updating records.
  `,
  // The AI reads this verbatim. Treat it like documentation for a
  // developer who has never seen your code. Include:
  //   - What it does
  //   - When to use it (and when NOT to)
  //   - What it returns
  //   - Any important constraints or behaviour

  // ── Input Schema (JSON Schema draft 7) ────────────────────────────────
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search term. Matches against name, email, company.",
      },
      limit: {
        type: "number",
        description: "Max results to return. Defaults to 10. Max 100.",
        default: 10,
      },
      active_only: {
        type: "boolean",
        description: "If true, exclude deactivated accounts. Default false.",
      },
    },
    required: ["query"], // AI MUST supply these
    additionalProperties: false, // reject unknown keys — good hygiene
  },

  // ── Handler ───────────────────────────────────────────────────────────
  handler: async (args) => {
    const query = args.query as string;
    const limit = (args.limit as number | undefined) ?? 10;
    const activeOnly = (args.active_only as boolean | undefined) ?? false;

    try {
      const results = await db.search(query, { limit, activeOnly });

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No results found for "${query}".` }],
        };
      }

      const formatted = results
        .map((r) => `- ${r.name} (${r.email})`)
        .join("\n");
      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} results:\n${formatted}`,
          },
        ],
      };
    } catch (e) {
      // NEVER throw — return isError so Claude can self-correct
      return {
        content: [
          { type: "text", text: `Database error: ${(e as Error).message}` },
        ],
        isError: true,
      };
    }
  },
};
```

... (file continues with same content as original)
