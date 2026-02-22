/**
 * tools.ts — Tool definitions for the Filesystem MCP Server.
 */

import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: `ERROR: ${message}` }], isError: true };
}

function safePath(inputPath: string): string {
  return path.resolve(process.cwd(), inputPath);
}

// ---------------------------------------------------------------------------
// Tool: read_file
// ---------------------------------------------------------------------------

const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read the complete text content of a file at the given path. " +
    "Returns the raw text. Fails if the path does not exist or is a directory.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file." },
      encoding: {
        type: "string",
        enum: ["utf8", "base64"],
        description: "Encoding. Defaults to 'utf8'.",
      },
    },
    required: ["path"],
  },
  async handler(args) {
    const filePath = safePath(args.path as string);
    const encoding = (args.encoding as BufferEncoding | undefined) ?? "utf8";
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        return err(`'${filePath}' is a directory. Use list_directory instead.`);
      }
      const content = await fs.readFile(filePath, { encoding });
      const sizeKB = (stats.size / 1024).toFixed(2);
      return ok(
        `File: ${filePath}\nSize: ${sizeKB} KB\nEncoding: ${encoding}\n\n--- Content ---\n${content}`
      );
    } catch (e: unknown) {
      return err(`Could not read file: ${(e as NodeJS.ErrnoException).message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Tool: write_file
// ---------------------------------------------------------------------------

const writeFileTool: ToolDefinition = {
  name: "write_file",
  description:
    "Write (or overwrite) a file at the given path with the provided text content. " +
    "Creates parent directories if they do not exist. " +
    "Use with caution — existing content is replaced.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file to write." },
      content: { type: "string", description: "Text content to write." },
      append: {
        type: "boolean",
        description: "If true, append instead of overwriting. Default false.",
      },
    },
    required: ["path", "content"],
  },
  async handler(args) {
    const filePath = safePath(args.path as string);
    const content = args.content as string;
    const append = (args.append as boolean | undefined) ?? false;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      if (append) {
        await fs.appendFile(filePath, content, "utf8");
        return ok(`Appended ${content.length} characters to '${filePath}'.`);
      } else {
        await fs.writeFile(filePath, content, "utf8");
        return ok(`Wrote ${content.length} characters to '${filePath}'.`);
      }
    } catch (e: unknown) {
      return err(`Could not write file: ${(e as NodeJS.ErrnoException).message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Tool: list_directory
// ---------------------------------------------------------------------------

const listDirectoryTool: ToolDefinition = {
  name: "list_directory",
  description:
    "List the contents of a directory. Returns each entry with its type, size, " +
    "and last-modified date. Use recursive=true to list all nested files.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the directory." },
      recursive: {
        type: "boolean",
        description: "If true, list all files recursively. Default false.",
      },
    },
    required: ["path"],
  },
  async handler(args) {
    const dirPath = safePath(args.path as string);
    const recursive = (args.recursive as boolean | undefined) ?? false;
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return err(`'${dirPath}' is not a directory. Use read_file to read files.`);
      }
      const lines: string[] = [`Directory: ${dirPath}\n`];
      await collectEntries(dirPath, dirPath, recursive, lines);
      lines.push(`\nTotal entries: ${lines.length - 1}`);
      return ok(lines.join("\n"));
    } catch (e: unknown) {
      return err(`Could not list directory: ${(e as NodeJS.ErrnoException).message}`);
    }
  },
};

async function collectEntries(
  baseDir: string,
  currentDir: string,
  recursive: boolean,
  lines: string[]
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      lines.push(`[DIR]  ${relativePath}/`);
      if (recursive) await collectEntries(baseDir, fullPath, recursive, lines);
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      const sizeKB = (stat.size / 1024).toFixed(1);
      const modified = stat.mtime.toISOString().replace("T", " ").slice(0, 19);
      lines.push(
        `[FILE] ${relativePath.padEnd(50)} ${sizeKB.padStart(8)} KB  ${modified}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tool: search_files
// ---------------------------------------------------------------------------

const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description:
    "Search for files whose names match a pattern (case-insensitive substring or glob-style " +
    "wildcard *). Walks a directory tree and returns all matching file paths.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { type: "string", description: "Root directory to search within." },
      pattern: {
        type: "string",
        description: "Search pattern. Use * as a wildcard. E.g. '*.ts'.",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results. Default 50.",
      },
    },
    required: ["directory", "pattern"],
  },
  async handler(args) {
    const searchDir = safePath(args.directory as string);
    const pattern = args.pattern as string;
    const maxResults = (args.maxResults as number | undefined) ?? 50;
    try {
      const regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      const regex = new RegExp(regexStr, "i");
      const results: string[] = [];
      await walkAndMatch(searchDir, regex, results, maxResults);
      if (results.length === 0) {
        return ok(`No files matching '${pattern}' found in '${searchDir}'.`);
      }
      const header = `Found ${results.length} match(es) for '${pattern}' in '${searchDir}':\n`;
      return ok(header + results.map((r) => `  ${r}`).join("\n"));
    } catch (e: unknown) {
      return err(`Search failed: ${(e as NodeJS.ErrnoException).message}`);
    }
  },
};

async function walkAndMatch(
  dir: string,
  regex: RegExp,
  results: string[],
  maxResults: number
): Promise<void> {
  if (results.length >= maxResults) return;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", ".cache"].includes(entry.name)) continue;
        await walkAndMatch(fullPath, regex, results, maxResults);
      } else if (entry.isFile() && regex.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    return;
  }
}

// ---------------------------------------------------------------------------
// Tool: get_file_info
// ---------------------------------------------------------------------------

const getFileInfoTool: ToolDefinition = {
  name: "get_file_info",
  description:
    "Get detailed metadata about a file or directory: size, type, permissions, " +
    "creation time, last modified time, and MIME type guess.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute or relative path to the file or directory.",
      },
    },
    required: ["path"],
  },
  async handler(args) {
    const filePath = safePath(args.path as string);
    try {
      const stats = await fs.stat(filePath);
      const type = stats.isDirectory()
        ? "directory"
        : stats.isSymbolicLink()
          ? "symlink"
          : "file";
      const mime = guessMime(filePath);
      const sizeBytes = stats.size;
      const info = [
        `Path:           ${filePath}`,
        `Type:           ${type}`,
        `MIME (guessed): ${mime}`,
        `Size:           ${sizeBytes} bytes  (${(sizeBytes / 1024).toFixed(2)} KB)`,
        `Created:        ${stats.birthtime.toISOString()}`,
        `Modified:       ${stats.mtime.toISOString()}`,
        `Accessed:       ${stats.atime.toISOString()}`,
        `Permissions:    ${(stats.mode & 0o777).toString(8)} (octal)`,
      ].join("\n");
      return ok(info);
    } catch (e: unknown) {
      return err(`Could not stat path: ${(e as NodeJS.ErrnoException).message}`);
    }
  },
};

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".py": "text/x-python",
    ".rs": "text/x-rust",
    ".go": "text/x-go",
    ".sh": "text/x-shellscript",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".toml": "text/toml",
    ".csv": "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Tool: delete_file
// ---------------------------------------------------------------------------

const deleteFileTool: ToolDefinition = {
  name: "delete_file",
  description:
    "Delete a file at the given path. This operation is IRREVERSIBLE. " +
    "Does not delete directories.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute or relative path to the file to delete.",
      },
    },
    required: ["path"],
  },
  async handler(args) {
    const filePath = safePath(args.path as string);
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        return err(`'${filePath}' is a directory. This tool only deletes files.`);
      }
      await fs.unlink(filePath);
      return ok(`Deleted file: '${filePath}'.`);
    } catch (e: unknown) {
      return err(`Could not delete file: ${(e as NodeJS.ErrnoException).message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ALL_TOOLS: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  searchFilesTool,
  getFileInfoTool,
  deleteFileTool,
];
