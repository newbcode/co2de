import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { TokenAdapter } from "./types.js";
import type { TokenUsage, SessionSummary } from "../core/types.js";
import { calculateCost, calculateCarbon } from "../engine/carbon-calculator.js";

// ─── Constants ────────────────────────────────────────────

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

// ─── JSONL Parser ─────────────────────────────────────────

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

export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, "-");
}

export function getProjectDir(projectPath: string): string {
  return join(CLAUDE_PROJECTS_DIR, encodeProjectPath(projectPath));
}

export function listSessionFiles(projectDir: string): string[] {
  if (!existsSync(projectDir)) return [];

  return readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(projectDir, f));
}

export function getSessionSummary(filePath: string, region = "global"): SessionSummary | null {
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
    model = entry.model;
  }

  // Aggregate token usage for both CO2 and cost calculation
  const aggregated: TokenUsage = {
    input_tokens: entries.reduce((s, e) => s + e.input_tokens, 0),
    output_tokens: entries.reduce((s, e) => s + e.output_tokens, 0),
    cache_read_tokens: entries.reduce((s, e) => s + e.cache_read_tokens, 0),
    cache_write_tokens: entries.reduce((s, e) => s + e.cache_write_tokens, 0),
    model,
    provider: "claude",
    timestamp: firstTimestamp,
    session_id: sessionId,
  };
  const co2 = calculateCarbon(aggregated, region).co2_grams;
  const cost = calculateCost(aggregated);

  return {
    id: sessionId,
    provider: "claude",
    model,
    timestamp: firstTimestamp,
    total_tokens: totalTokens,
    co2_grams: co2,
    cost_usd: cost,
  };
}

/** Detailed session data with multi-model support and full token breakdown. */
export interface DetailedSession {
  project: string;        // human-readable project name
  projectDir: string;     // raw directory name
  sessionId: string;
  models: string[];       // all models used in this session
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost_usd: number;
  co2_grams: number;
  cache_hit_pct: number;  // cache_read / (input + cache_write + cache_read) * 100
  last_activity: string;  // ISO date
  entry_count: number;    // number of API calls
}

/**
 * Collect detailed session data from a single JSONL file.
 */
export function getDetailedSession(filePath: string, projectName: string, region = "global"): DetailedSession | null {
  const entries = parseSessionFile(filePath);
  if (entries.length === 0) return null;

  const models = new Set<string>();
  let input = 0, output = 0, cacheW = 0, cacheR = 0;
  let lastTs = entries[0].timestamp;

  for (const e of entries) {
    models.add(e.model);
    input += e.input_tokens;
    output += e.output_tokens;
    cacheW += e.cache_write_tokens;
    cacheR += e.cache_read_tokens;
    if (e.timestamp > lastTs) lastTs = e.timestamp;
  }

  const total = input + output + cacheW + cacheR;

  // Calculate cost by aggregating per-model
  const modelEntries = new Map<string, TokenUsage>();
  for (const e of entries) {
    const existing = modelEntries.get(e.model);
    if (existing) {
      existing.input_tokens += e.input_tokens;
      existing.output_tokens += e.output_tokens;
      existing.cache_read_tokens += e.cache_read_tokens;
      existing.cache_write_tokens += e.cache_write_tokens;
    } else {
      modelEntries.set(e.model, { ...e });
    }
  }

  let cost = 0;
  let co2 = 0;
  for (const usage of modelEntries.values()) {
    cost += calculateCost(usage);
    const result = calculateCarbon(usage, region);
    co2 += result.co2_grams;
  }

  return {
    project: projectName,
    projectDir: basename(filePath, ".jsonl"),
    sessionId: entries[0].session_id,
    models: [...models],
    input_tokens: input,
    output_tokens: output,
    cache_write_tokens: cacheW,
    cache_read_tokens: cacheR,
    total_tokens: total,
    cost_usd: cost,
    co2_grams: co2,
    cache_hit_pct: (input + cacheW + cacheR) > 0 ? (cacheR / (input + cacheW + cacheR)) * 100 : 0,
    last_activity: lastTs,
    entry_count: entries.length,
  };
}

/**
 * Resolve an encoded path segment by greedily matching real filesystem dirs.
 * e.g. from "/Users/yunchangkang", encoded "social-research-tool"
 *   → tries "social-research-tool" (exists!) → done
 * e.g. from "/Users/yunchangkang", encoded "Desktop-newbcode-co2de"
 *   → tries "Desktop-newbcode-co2de" (no) → "Desktop" (yes!)
 *   → from ~/Desktop, tries "newbcode-co2de" (no) → "newbcode" (yes!)
 *   → from ~/Desktop/newbcode, tries "co2de" (yes!) → done
 */
function resolveEncodedPath(basePath: string, encoded: string): string {
  const segments = encoded.split("-");
  let current = basePath;
  let i = 0;

  while (i < segments.length) {
    let found = false;
    // Try longest remaining match first
    for (let j = segments.length; j > i; j--) {
      const candidate = segments.slice(i, j).join("-");
      const fullPath = join(current, candidate);
      if (existsSync(fullPath)) {
        current = fullPath;
        i = j;
        found = true;
        break;
      }
    }
    if (!found) {
      // Can't resolve — join remaining with "-" (preserve original name)
      current = join(current, segments.slice(i).join("-"));
      break;
    }
  }

  return current;
}

/**
 * Decode encoded project directory name into a human-readable name.
 * Uses filesystem-based resolution to correctly handle dashes in directory names.
 *
 * e.g. "-Users-yunchangkang-Desktop-newbcode-co2de" → "newbcode/co2de"
 *      "-Users-yunchangkang-social-research-tool" → "social-research-tool"
 *      "-Users-yunchangkang-Desktop-SUKDOK-WIKI" → "SUKDOK-WIKI"
 *      "-Users-yunchangkang-Desktop-newbcode-Zingibrew--claude-worktrees-quizzical-napier" → "Zingibrew (worktree)"
 *      "-Users-yunchangkang" → "~"
 */
export function decodeProjectName(dirName: string): string {
  const raw = dirName.startsWith("-") ? dirName.slice(1) : dirName;
  const home = homedir();
  const homeEncoded = home.slice(1).replace(/\//g, "-"); // "Users-yunchangkang"

  // Detect worktree paths
  const wtIdx = raw.indexOf("--claude-worktrees-");
  if (wtIdx !== -1) {
    const base = raw.slice(0, wtIdx);
    const resolved = resolveEncodedPath("/", base);
    const rel = resolved.replace(home + "/", "").replace(/^Desktop\//, "");
    // Take just the project name (last segment)
    const projName = rel.split("/").pop() ?? rel;
    return `${projName} (worktree)`;
  }

  if (!raw.startsWith(homeEncoded)) return raw;

  const rest = raw.slice(homeEncoded.length);
  if (!rest || rest === "-") return "~";

  // Strip leading dash
  const encoded = rest.startsWith("-") ? rest.slice(1) : rest;
  if (!encoded) return "~";

  // Resolve against real filesystem
  const resolved = resolveEncodedPath(home, encoded);
  const relative = resolved.replace(home + "/", "");

  // Strip "Desktop/" prefix for brevity
  const display = relative.replace(/^Desktop\//, "");
  return display;
}

/**
 * Collect detailed sessions for a single project path (cwd-style).
 *
 * This is the per-repo view used by `co2de readme` and the default
 * `co2de dashboard` scope. Returns [] if no sessions match the path.
 */
export function collectProjectSessions(
  projectPath: string,
  from?: Date,
  to?: Date,
  region = "global",
): DetailedSession[] {
  const projectDir = getProjectDir(projectPath);
  if (!existsSync(projectDir)) return [];

  const dirName = basename(projectDir);
  const projectName = decodeProjectName(dirName);
  const sessions: DetailedSession[] = [];

  for (const file of listSessionFiles(projectDir)) {
    const detail = getDetailedSession(file, projectName, region);
    if (!detail) continue;
    if (detail.total_tokens === 0) continue;

    if (from || to) {
      const ts = new Date(detail.last_activity);
      if (from && ts < from) continue;
      if (to && ts > to) continue;
    }

    sessions.push(detail);
  }

  return sessions.sort(
    (a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime(),
  );
}

/**
 * Collect all detailed sessions across all projects.
 */
export function collectAllSessions(from?: Date, to?: Date, region = "global"): DetailedSession[] {
  const sessions: DetailedSession[] = [];

  for (const projectDir of listProjectDirs()) {
    const dirName = basename(projectDir);
    const projectName = decodeProjectName(dirName);

    const files = listSessionFiles(projectDir);
    for (const file of files) {
      const detail = getDetailedSession(file, projectName, region);
      if (!detail) continue;
      // Skip empty sessions (no actual token usage)
      if (detail.total_tokens === 0) continue;

      if (from || to) {
        const ts = new Date(detail.last_activity);
        if (from && ts < from) continue;
        if (to && ts > to) continue;
      }

      sessions.push(detail);
    }
  }

  return sessions.sort(
    (a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime(),
  );
}

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

// ─── Adapter Class ────────────────────────────────────────

/**
 * Claude CLI adapter — reads token usage from local JSONL session files.
 *
 * Data source: ~/.claude/projects/<encoded-path>/<session-id>.jsonl
 */
export class ClaudeAdapter implements TokenAdapter {
  readonly provider = "claude";
  readonly region: string;

  constructor(region = "global") {
    this.region = region;
  }

  async getSessionUsage(sessionId: string): Promise<TokenUsage[]> {
    for (const projectDir of listProjectDirs()) {
      const files = listSessionFiles(projectDir);
      for (const file of files) {
        if (file.includes(sessionId)) {
          return parseSessionFile(file);
        }
      }
    }
    return [];
  }

  async listSessions(from: Date, to: Date): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    for (const projectDir of listProjectDirs()) {
      const files = listSessionFiles(projectDir);
      for (const file of files) {
        const summary = getSessionSummary(file, this.region);
        if (!summary) continue;

        const ts = new Date(summary.timestamp);
        if (ts >= from && ts <= to) {
          summaries.push(summary);
        }
      }
    }

    return summaries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  async getProjectSessions(
    projectPath: string,
  ): Promise<SessionSummary[]> {
    const projectDir = getProjectDir(projectPath);
    const files = listSessionFiles(projectDir);
    const summaries: SessionSummary[] = [];

    for (const file of files) {
      const summary = getSessionSummary(file, this.region);
      if (summary) summaries.push(summary);
    }

    return summaries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  async isAvailable(): Promise<boolean> {
    return listProjectDirs().length > 0;
  }

  findSessionFile(sessionId: string): string | null {
    for (const projectDir of listProjectDirs()) {
      const files = listSessionFiles(projectDir);
      for (const file of files) {
        if (file.includes(sessionId)) return file;
      }
    }
    return null;
  }
}
