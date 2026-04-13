import type { TokenUsage, AuditFinding } from "../core/types.js";

/**
 * Detect context bloat: input_tokens growing significantly across a session.
 * If input tokens more than triple from start to end, context is bloating.
 */
export function analyzeContextGrowth(
  entries: TokenUsage[],
): AuditFinding | null {
  if (entries.length < 3) return null;

  const firstInput = entries[0].input_tokens + entries[0].cache_read_tokens;
  const lastInput =
    entries[entries.length - 1].input_tokens +
    entries[entries.length - 1].cache_read_tokens;

  if (firstInput === 0) return null;

  const growthRatio = lastInput / firstInput;

  if (growthRatio < 3) return null;

  // Estimate savings from splitting the session
  const midpoint = Math.floor(entries.length / 2);
  const lateEntries = entries.slice(midpoint);
  const extraTokensPerMessage =
    lateEntries.reduce(
      (s, e) => s + e.input_tokens + e.cache_read_tokens - firstInput,
      0,
    );

  // Rough savings estimate: extra tokens × energy saved
  const savingsGrams = extraTokensPerMessage * 0.005 * 1.2 * 475 / 1_000_000;

  if (savingsGrams < 0.01) return null;

  return {
    severity: growthRatio > 5 ? "high" : "medium",
    pattern: "Context bloat",
    description: `Input tokens grew ${growthRatio.toFixed(1)}x over ${entries.length} messages (${firstInput.toLocaleString()} → ${lastInput.toLocaleString()})`,
    potential_savings_grams: Math.max(0, savingsGrams),
    suggestion: "Start fresh sessions for new topics to keep context lean",
  };
}
