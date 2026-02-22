/**
 * prompts.ts — Prompt definitions for the Filesystem MCP Server.
 *
 * Prompts are reusable, parameterized message templates that clients
 * surface as slash-commands (e.g. /review-file).
 */

import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: PromptArgument[];
  generate: (args: Record<string, string>) => Promise<PromptMessage[]>;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

// ---------------------------------------------------------------------------
// Prompt: review-file
// ---------------------------------------------------------------------------

const reviewFilePrompt: PromptDefinition = {
  name: "review-file",
  description:
    "Perform a detailed code review of a file. The model will analyse code quality, " +
    "structure, potential bugs, and suggest improvements.",
  arguments: [
    { name: "path", description: "Path to the file you want reviewed.", required: true },
    {
      name: "focus",
      description: "Optional focus: 'security', 'performance', 'readability', or 'all' (default).",
      required: false,
    },
  ],
  async generate(args) {
    const filePath = path.resolve(process.cwd(), args.path ?? "");
    const focus = args.focus ?? "all";
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, "utf8");
    } catch {
      fileContent = "(Could not read file — it may not exist or is binary)";
    }
    const focusInstruction =
      focus === "all"
        ? "Cover: code quality, correctness, security, performance, and readability."
        : `Focus especially on **${focus}** concerns, but note any critical issues in other areas too.`;
    return [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Please perform a thorough code review of the following file.\n\n` +
            `**File:** \`${filePath}\`\n` +
            `**Review focus:** ${focus}\n\n` +
            `${focusInstruction}\n\n` +
            `--- File Content ---\n\`\`\`\n${fileContent}\n\`\`\``,
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// Prompt: summarize-directory
// ---------------------------------------------------------------------------

const summarizeDirectoryPrompt: PromptDefinition = {
  name: "summarize-directory",
  description:
    "Generate a high-level summary of a project directory — what it does, " +
    "how it's structured, and what each major file/folder is responsible for.",
  arguments: [
    { name: "path", description: "Path to the directory to summarize.", required: true },
  ],
  async generate(args) {
    const dirPath = path.resolve(process.cwd(), args.path ?? ".");
    let tree: string;
    try {
      tree = await buildTree(dirPath, dirPath, 0, 3);
    } catch {
      tree = "(Could not read directory)";
    }
    return [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Please analyse the following project directory structure and provide:\n\n` +
            `1. **Project purpose** — What does this project/folder do?\n` +
            `2. **Architecture overview** — How is the code organised?\n` +
            `3. **Key files/folders** — What does each important entry do?\n` +
            `4. **Technology stack** — Languages, frameworks, tools used.\n` +
            `5. **Entry points** — Where does execution start?\n\n` +
            `**Directory:** \`${dirPath}\`\n\n` +
            `--- Directory Tree ---\n${tree}`,
        },
      },
    ];
  },
};

async function buildTree(
  base: string,
  dir: string,
  depth: number,
  maxDepth: number
): Promise<string> {
  if (depth > maxDepth) return "";
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const ignored = new Set(["node_modules", ".git", "dist", ".cache", "__pycache__"]);
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    if (entry.isDirectory()) {
      lines.push(`${indent}${entry.name}/`);
      const sub = await buildTree(base, path.join(dir, entry.name), depth + 1, maxDepth);
      if (sub) lines.push(sub);
    } else {
      lines.push(`${indent}${entry.name}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Prompt: find-and-explain
// ---------------------------------------------------------------------------

const findAndExplainPrompt: PromptDefinition = {
  name: "find-and-explain",
  description:
    "Find a file by name and ask the model to explain what it does in plain English. " +
    "Great for onboarding to an unfamiliar codebase.",
  arguments: [
    { name: "filename", description: "The file name to look for (e.g. 'server.ts').", required: true },
    {
      name: "directory",
      description: "Root directory to search. Defaults to current directory.",
      required: false,
    },
  ],
  async generate(args) {
    const filename = args.filename ?? "";
    const searchDir = path.resolve(process.cwd(), args.directory ?? ".");
    let foundPath: string | null = null;
    let fileContent = "(File not found)";
    try {
      foundPath = await findFirst(searchDir, filename, 0, 5);
      if (foundPath) fileContent = await fs.readFile(foundPath, "utf8");
    } catch {
      /* ignore */
    }
    return [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `I found the file \`${foundPath ?? filename}\`. ` +
            `Please explain what it does in plain English:\n\n` +
            `- What is its purpose?\n` +
            `- What are the most important parts?\n` +
            `- Are there any non-obvious patterns or tricks?\n\n` +
            `--- File Content ---\n\`\`\`\n${fileContent}\n\`\`\``,
        },
      },
    ];
  },
};

async function findFirst(
  dir: string,
  filename: string,
  depth: number,
  maxDepth: number
): Promise<string | null> {
  if (depth > maxDepth) return null;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const ignored = new Set(["node_modules", ".git", "dist"]);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === filename) return fullPath;
    if (entry.isDirectory() && !ignored.has(entry.name)) {
      const found = await findFirst(fullPath, filename, depth + 1, maxDepth);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ALL_PROMPTS: PromptDefinition[] = [
  reviewFilePrompt,
  summarizeDirectoryPrompt,
  findAndExplainPrompt,
];
