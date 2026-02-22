/**
 * resources.ts — Resource definitions for the Filesystem MCP Server.
 */

import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceInfo {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

// ---------------------------------------------------------------------------
// Static resource discovery
// ---------------------------------------------------------------------------

export async function buildStaticResources(): Promise<ResourceInfo[]> {
  const cwd = process.cwd();
  const candidates = [
    { file: "README.md", mime: "text/markdown", desc: "Project README" },
    { file: "package.json", mime: "application/json", desc: "Node.js package manifest" },
    { file: "tsconfig.json", mime: "application/json", desc: "TypeScript configuration" },
    { file: ".env", mime: "text/plain", desc: "Environment variables" },
  ];

  const resources: ResourceInfo[] = [];

  for (const { file, mime, desc } of candidates) {
    const fullPath = path.join(cwd, file);
    try {
      await fs.access(fullPath);
      resources.push({
        uri: `file://${fullPath}`,
        name: file,
        description: `${desc} — ${fullPath}`,
        mimeType: mime,
      });
    } catch {
      // File doesn't exist — skip
    }
  }

  resources.push({
    uri: `file://${cwd}/`,
    name: "Working Directory",
    description: `Current working directory: ${cwd}`,
    mimeType: "text/plain",
  });

  return resources;
}

// ---------------------------------------------------------------------------
// Dynamic resource reader
// ---------------------------------------------------------------------------

export async function readResource(uri: string): Promise<ResourceContent> {
  if (!uri.startsWith("file://")) {
    throw new Error("Unsupported URI scheme. Only 'file://' URIs are supported.");
  }

  const rawPath = uri.slice("file://".length);

  if (rawPath.endsWith("/")) {
    const dirPath = rawPath.slice(0, -1) || "/";
    return { uri, mimeType: "text/plain", text: await buildDirectoryListing(dirPath) };
  }

  try {
    const stats = await fs.stat(rawPath);

    if (stats.isDirectory()) {
      return { uri, mimeType: "text/plain", text: await buildDirectoryListing(rawPath) };
    }

    const textMimes = new Set([
      ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".txt",
      ".html", ".css", ".yaml", ".yml", ".toml", ".csv",
      ".sh", ".py", ".rs", ".go", ".xml", ".env",
    ]);
    const ext = path.extname(rawPath).toLowerCase();

    if (textMimes.has(ext) || stats.size < 512 * 1024) {
      const text = await fs.readFile(rawPath, "utf8");
      return { uri, mimeType: "text/plain", text };
    } else {
      const buffer = await fs.readFile(rawPath);
      return { uri, mimeType: "application/octet-stream", blob: buffer.toString("base64") };
    }
  } catch (e: unknown) {
    throw new Error(`Cannot read resource '${uri}': ${(e as NodeJS.ErrnoException).message}`);
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function buildDirectoryListing(dirPath: string): Promise<string> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const lines: string[] = [`Directory listing: ${dirPath}\n`];
  for (const entry of entries) {
    const prefix = entry.isDirectory() ? "[DIR] " : "[FILE]";
    lines.push(`${prefix}  ${entry.name}`);
  }
  return lines.join("\n");
}
