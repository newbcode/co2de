import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STATS_CACHE_PATH = join(homedir(), ".claude", "stats-cache.json");

interface StatsCache {
  version: number;
  dailyActivity: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
    toolCallCount: number;
  }>;
  dailyModelTokens: Array<{
    date: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }>;
  modelUsage: Record<string, number>;
  totalSessions: number;
  totalMessages: number;
  firstSessionDate: string;
}

/**
 * Read the Claude CLI stats cache file.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function readStatsCache(): StatsCache | null {
  if (!existsSync(STATS_CACHE_PATH)) return null;

  try {
    const raw = readFileSync(STATS_CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Get total sessions count from stats cache.
 */
export function getTotalSessions(): number {
  const stats = readStatsCache();
  return stats?.totalSessions ?? 0;
}

/**
 * Get daily activity from stats cache.
 */
export function getDailyActivity(): Array<{
  date: string;
  messageCount: number;
  sessionCount: number;
}> {
  const stats = readStatsCache();
  return stats?.dailyActivity ?? [];
}

/**
 * Get the first session date from stats cache.
 */
export function getFirstSessionDate(): string | null {
  const stats = readStatsCache();
  return stats?.firstSessionDate ?? null;
}
