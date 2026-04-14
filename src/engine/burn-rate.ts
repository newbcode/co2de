import type { TokenUsage } from "../core/types.js";
import { calculateCarbon, calculateCost } from "./carbon-calculator.js";

export interface BurnRate {
  tokens_per_minute: number;
  co2_per_hour: number;
  cost_per_hour: number;
  session_duration_minutes: number;
}

/**
 * Calculate burn rate from a sequence of token usage entries.
 * Requires at least 2 entries with different timestamps.
 */
export function calculateBurnRate(
  entries: TokenUsage[],
  region = "global",
): BurnRate | null {
  if (entries.length < 2) return null;

  const timestamps = entries
    .map((e) => new Date(e.timestamp).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  if (timestamps.length < 2) return null;

  const durationMs = timestamps[timestamps.length - 1] - timestamps[0];
  const durationMinutes = durationMs / 60_000;

  if (durationMinutes < 1) return null;

  let totalTokens = 0;
  let totalCO2 = 0;
  let totalCost = 0;

  for (const e of entries) {
    totalTokens += e.input_tokens + e.output_tokens + e.cache_read_tokens + e.cache_write_tokens;
    totalCO2 += calculateCarbon(e, region).co2_grams;
    totalCost += calculateCost(e);
  }

  return {
    tokens_per_minute: totalTokens / durationMinutes,
    co2_per_hour: (totalCO2 / durationMinutes) * 60,
    cost_per_hour: (totalCost / durationMinutes) * 60,
    session_duration_minutes: durationMinutes,
  };
}
