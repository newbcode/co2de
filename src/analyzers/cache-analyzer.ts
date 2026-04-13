import type { TokenUsage, AuditFinding } from "../core/types.js";

/**
 * Detect low cache utilization: high cache_creation but low cache_read ratio.
 * Good caching means reusing context across messages (high cache_read).
 */
export function analyzeCacheUtilization(
  entries: TokenUsage[],
): AuditFinding | null {
  let totalCacheWrite = 0;
  let totalCacheRead = 0;

  for (const e of entries) {
    totalCacheWrite += e.cache_write_tokens;
    totalCacheRead += e.cache_read_tokens;
  }

  const totalCache = totalCacheWrite + totalCacheRead;
  if (totalCache < 1000) return null; // not enough data

  const readRatio = totalCacheRead / totalCache;

  if (readRatio > 0.5) return null; // cache is being used well

  const wastedTokens = totalCacheWrite * (1 - readRatio);
  const savingsGrams = wastedTokens * 0.003 * 1.2 * 475 / 1_000_000 * 0.3;

  if (savingsGrams < 0.01) return null;

  return {
    severity: readRatio < 0.2 ? "medium" : "low",
    pattern: "Low cache utilization",
    description: `Cache read ratio: ${(readRatio * 100).toFixed(0)}% (${totalCacheRead.toLocaleString()} read / ${totalCacheWrite.toLocaleString()} created)`,
    potential_savings_grams: savingsGrams,
    suggestion: "Structure prompts for better cache hits — keep stable system prompts",
  };
}
