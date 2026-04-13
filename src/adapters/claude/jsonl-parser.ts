import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { TokenUsage, SessionSummary } from "../../core/types.js";
import { quickCO2 } from "../../engine/carbon-calculator.js";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

/**
 * JSONL line structure for Claude CLI session files.
 *
 * File location: ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 * Encoded path: dashes replace path separators (e.g., -Users-foo-project)
 */
interface ClaudeJSONLLine {
  type: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  message?: {
    model?: string;
    role?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    content?: Array<{
      type: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
}

/**
 * Parse a single JSONL session file and extract token usage entries.
 */
export function parseSessionFile(filePath: string): TokenUsage[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const entries: TokenUsage[] = [];

  let sessionId = "";

  for (const line of lines) {
    let parsed: ClaudeJSONLLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.sessionId && !sessionId) {
      sessionId = parsed.sessionId;
    }

    if (parsed.type !== "assistant" || !parsed.message?.usage) {
      continue;
    }

    const usage = parsed.message.usage;
    entries.push({
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      model: parsed.message.model ?? "unknown",
      provider: "claude",
      timestamp: parsed.timestamp ?? new Date().toISOString(),
      session_id: sessionId || basename(filePath, ".jsonl"),
    });
  }

  return entries;
}

/**
 * Count lines of code written via Write/Edit tool calls in a session.
 * Used by the hand-coding comparison feature.
 */
export function countLinesWritten(filePath: string): number {
  if (!existsSync(filePath)) return 0;

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  let totalLines = 0;

  for (const line of lines) {
    let parsed: ClaudeJSONLLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type !== "assistant" || !parsed.message?.content) continue;

    for (const block of parsed.message.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "Write" && block.input) {
        const fileContent = block.input["content"];
        if (typeof fileContent === "string") {
          totalLines += fileContent.split("\n").length;
        }
      }

      if (block.name === "Edit" && block.input) {
        const newStr = block.input["new_string"];
        if (typeof newStr === "string") {
          const oldStr = block.input["old_string"];
          const oldLines =
            typeof oldStr === "string" ? oldStr.split("\n").length : 0;
          const newLines = newStr.split("\n").length;
          totalLines += Math.max(0, newLines - oldLines);
        }
      }
    }
  }

  return totalLines;
}

/**
 * Encode a filesystem path to the Claude project directory name format.
 * e.g., /Users/foo/project → -Users-foo-project
 */
export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, "-");
}

/**
 * Get the Claude projects directory for a given project path.
 */
export function getProjectDir(projectPath: string): string {
  return join(CLAUDE_PROJECTS_DIR, encodeProjectPath(projectPath));
}

/**
 * List all JSONL session files in a project directory.
 */
export function listSessionFiles(projectDir: string): string[] {
  if (!existsSync(projectDir)) return [];

  return readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(projectDir, f));
}

/**
 * Get a session summary from a JSONL file.
 */
export function getSessionSummary(filePath: string): SessionSummary | null {
  const entries = parseSessionFile(filePath);
  if (entries.length === 0) return null;

  let totalTokens = 0;
  let model = "unknown";
  const firstTimestamp = entries[0].timestamp;
  const sessionId = entries[0].session_id;

  for (const entry of entries) {
    totalTokens +=
      entry.input_tokens +
      entry.output_tokens +
      entry.cache_read_tokens +
      entry.cache_write_tokens;
    model = entry.model; // use last model as the primary
  }

  // Calculate CO2 using the last model (most representative)
  const co2 = quickCO2(
    entries.reduce((s, e) => s + e.input_tokens, 0),
    entries.reduce((s, e) => s + e.output_tokens, 0),
    model,
  );

  return {
    id: sessionId,
    provider: "claude",
    model,
    timestamp: firstTimestamp,
    total_tokens: totalTokens,
    co2_grams: co2,
  };
}

/**
 * Find all project directories in ~/.claude/projects/.
 */
export function listProjectDirs(): string[] {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return [];

  return readdirSync(CLAUDE_PROJECTS_DIR)
    .map((d) => join(CLAUDE_PROJECTS_DIR, d))
    .filter((d) => {
      try {
        return readdirSync(d).some((f) => f.endsWith(".jsonl"));
      } catch {
        return false;
      }
    });
}
