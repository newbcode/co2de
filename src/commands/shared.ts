/**
 * Shared helpers for command handlers.
 * Eliminates duplicated patterns across commands.
 */
import { ClaudeAdapter } from "../adapters/claude.js";
import { loadConfig } from "../core/config.js";
import type { TokenUsage, SessionSummary, Co2deConfig } from "../core/types.js";

// ─── Date Ranges ─────────────────────────────────────────

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function todayStart(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

// ─── Adapter + Config Shortcut ───────────────────────────

interface CommandContext {
  config: Co2deConfig;
  adapter: ClaudeAdapter;
}

export function createContext(): CommandContext {
  const config = loadConfig();
  const adapter = new ClaudeAdapter(config.region);
  return { config, adapter };
}

// ─── Latest Session ──────────────────────────────────────

interface LatestSessionResult {
  session: SessionSummary;
  entries: TokenUsage[];
}

export async function getLatestSession(adapter: ClaudeAdapter): Promise<LatestSessionResult | null> {
  const sessions = await adapter.listSessions(daysAgo(1), new Date());
  if (sessions.length === 0) return null;

  const session = sessions[0];
  const entries = await adapter.getSessionUsage(session.id);
  if (entries.length === 0) return null;

  return { session, entries };
}

// ─── Aggregate Token Entries ─────────────────────────────

export function aggregateTokenUsage(entries: TokenUsage[]): TokenUsage {
  return {
    input_tokens: entries.reduce((s, e) => s + e.input_tokens, 0),
    output_tokens: entries.reduce((s, e) => s + e.output_tokens, 0),
    cache_read_tokens: entries.reduce((s, e) => s + e.cache_read_tokens, 0),
    cache_write_tokens: entries.reduce((s, e) => s + e.cache_write_tokens, 0),
    model: entries[entries.length - 1].model,
    provider: entries[0].provider,
    timestamp: entries[0].timestamp,
    session_id: entries[0].session_id,
  };
}

export function totalTokenCount(usage: TokenUsage): number {
  return usage.input_tokens + usage.output_tokens +
    usage.cache_read_tokens + usage.cache_write_tokens;
}

// ─── Collect All Entries for Sessions ────────────────────

export async function collectAllEntries(
  adapter: ClaudeAdapter,
  sessions: SessionSummary[],
): Promise<TokenUsage[]> {
  const allEntries: TokenUsage[] = [];
  for (const s of sessions) {
    const entries = await adapter.getSessionUsage(s.id);
    allEntries.push(...entries);
  }
  return allEntries;
}

// ─── Budget Gram Parsing ─────────────────────────────────

export function parseGrams(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  let grams: number;
  if (cleaned.endsWith("kg")) {
    grams = parseFloat(cleaned.replace(/kg$/, "")) * 1000;
  } else {
    grams = parseFloat(cleaned.replace(/g$/, ""));
  }
  return isNaN(grams) ? null : grams;
}
