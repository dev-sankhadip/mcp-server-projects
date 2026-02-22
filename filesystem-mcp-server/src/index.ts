/**
 * index.ts — Filesystem MCP Server
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { ALL_TOOLS } from "./tools.js";
import { ALL_PROMPTS } from "./prompts.js";
import { buildStaticResources, readResource } from "./resources.js";

const SERVER_NAME = "filesystem-mcp-server";
const SERVER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Server instance
// ---------------------------------------------------------------------------

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.registerTool(
  "read_file",
  {
    description: ALL_TOOLS.find((t) => t.name === "read_file")!.description,
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the file."),
      encoding: z.enum(["utf8", "base64"]).optional().describe("Encoding. Defaults to 'utf8'."),
    },
  },
  async (args) => ALL_TOOLS.find((t) => t.name === "read_file")!.handler(args),
);

server.registerTool(
  "write_file",
  {
    description: ALL_TOOLS.find((t) => t.name === "write_file")!.description,
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the file to write."),
      content: z.string().describe("Text content to write."),
      append: z.boolean().optional().describe("If true, append instead of overwriting. Default false."),
    },
  },
  async (args) => ALL_TOOLS.find((t) => t.name === "write_file")!.handler(args),
);

server.registerTool(
  "list_directory",
  {
    description: ALL_TOOLS.find((t) => t.name === "list_directory")!.description,
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the directory."),
      recursive: z.boolean().optional().describe("If true, list all files recursively. Default false."),
    },
  },
  async (args) => ALL_TOOLS.find((t) => t.name === "list_directory")!.handler(args),
);

server.registerTool(
  "search_files",
  {
    description: ALL_TOOLS.find((t) => t.name === "search_files")!.description,
    inputSchema: {
      directory: z.string().describe("Root directory to search within."),
      pattern: z.string().describe("Search pattern. Use * as a wildcard. E.g. '*.ts'."),
      maxResults: z.number().optional().describe("Maximum number of results. Default 50."),
    },
  },
  async (args) => ALL_TOOLS.find((t) => t.name === "search_files")!.handler(args),
);

server.registerTool(
  "get_file_info",
  {
    description: ALL_TOOLS.find((t) => t.name === "get_file_info")!.description,
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the file or directory."),
    },
  },
  async (args) => ALL_TOOLS.find((t) => t.name === "get_file_info")!.handler(args),
);

server.registerTool(
  "delete_file",
  {
    description: ALL_TOOLS.find((t) => t.name === "delete_file")!.description,
    inputSchema: {
      path: z.string().describe("Absolute or relative path to the file to delete."),
    },
  },
  async (args) => ALL_TOOLS.find((t) => t.name === "delete_file")!.handler(args),
);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

server.registerPrompt(
  "review-file",
  {
    description: ALL_PROMPTS.find((p) => p.name === "review-file")!.description,
    argsSchema: {
      path: z.string().describe("Path to the file you want reviewed."),
      focus: z.string().optional().describe("'security', 'performance', 'readability', or 'all' (default)."),
    },
  },
  async (args) => {
    const messages = await ALL_PROMPTS.find((p) => p.name === "review-file")!.generate(args as Record<string, string>);
    return { messages };
  },
);

server.registerPrompt(
  "summarize-directory",
  {
    description: ALL_PROMPTS.find((p) => p.name === "summarize-directory")!.description,
    argsSchema: {
      path: z.string().describe("Path to the directory to summarize."),
    },
  },
  async (args) => {
    const messages = await ALL_PROMPTS.find((p) => p.name === "summarize-directory")!.generate(args as Record<string, string>);
    return { messages };
  },
);

server.registerPrompt(
  "find-and-explain",
  {
    description: ALL_PROMPTS.find((p) => p.name === "find-and-explain")!.description,
    argsSchema: {
      filename: z.string().describe("The file name to look for (e.g. 'server.ts')."),
      directory: z.string().optional().describe("Root directory to search. Defaults to current directory."),
    },
  },
  async (args) => {
    const messages = await ALL_PROMPTS.find((p) => p.name === "find-and-explain")!.generate(args as Record<string, string>);
    return { messages };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Register static file-system resources dynamically at startup
  const staticResources = await buildStaticResources();
  for (const resource of staticResources) {
    server.registerResource(
      resource.name,
      resource.uri,
      { description: resource.description, mimeType: resource.mimeType },
      async (uri) => {
        const content = await readResource(uri.toString());
        if (content.blob !== undefined) {
          return { contents: [{ uri: content.uri, mimeType: content.mimeType, blob: content.blob }] };
        }
        return { contents: [{ uri: content.uri, mimeType: content.mimeType, text: content.text ?? "" }] };
      },
    );
  }

  // Dynamic resource template for any file:// URI
  server.registerResource(
    "file",
    new ResourceTemplate("file://{path}", { list: undefined }),
    { description: "Read any file by its absolute path via a file:// URI.", mimeType: "text/plain" },
    async (uri) => {
      const content = await readResource(uri.toString());
      if (content.blob !== undefined) {
        return { contents: [{ uri: content.uri, mimeType: content.mimeType, blob: content.blob }] };
      }
      return { contents: [{ uri: content.uri, mimeType: content.mimeType, text: content.text ?? "" }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[${SERVER_NAME} v${SERVER_VERSION}] Server started.\n` +
    `[${SERVER_NAME}] Tools: ${ALL_TOOLS.map((t) => t.name).join(", ")}\n` +
    `[${SERVER_NAME}] Prompts: ${ALL_PROMPTS.map((p) => p.name).join(", ")}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[${SERVER_NAME}] Fatal error: ${String(err)}\n`);
  process.exit(1);
});
