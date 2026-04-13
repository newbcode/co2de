import type {
  TokenUsage,
  SavingsReport,
  SavingsBreakdownItem,
} from "../core/types.js";
import { ENERGY_PER_TOKEN_WH } from "../core/constants.js";
import { quickCO2 } from "./carbon-calculator.js";

/**
 * Calculate carbon savings by comparing actual usage against a worst-case baseline.
 *
 * Worst-case baseline assumptions:
 * - Always using the most expensive model (Opus: 0.005 Wh/token)
 * - No cache hits (all tokens are fresh context)
 * - No session splitting (maximum context bloat)
 *
 * The difference between worst-case and actual = savings from smart choices.
 */
export function calculateSavings(
  entries: TokenUsage[],
  region = "global",
): SavingsReport {
  if (entries.length === 0) {
    return {
      period: "N/A",
      actual_co2_grams: 0,
      worst_case_co2_grams: 0,
      saved_co2_grams: 0,
      savings_breakdown: [],
      lifetime_saved_grams: 0,
    };
  }

  const opusRate = ENERGY_PER_TOKEN_WH["claude-opus"];
  let actualCO2 = 0;
  let worstCaseCO2 = 0;
  let modelSavings = 0;
  let cacheSavings = 0;
  let smallModelCount = 0;
  let totalEntries = 0;

  for (const entry of entries) {
    const totalTokens =
      entry.input_tokens +
      entry.output_tokens +
      entry.cache_read_tokens +
      entry.cache_write_tokens;

    // Actual CO2
    const actual = quickCO2(
      entry.input_tokens + entry.cache_read_tokens + entry.cache_write_tokens,
      entry.output_tokens,
      entry.model,
      region,
    );
    actualCO2 += actual;

    // Worst case: same tokens but with opus rate
    const worstCase = quickCO2(
      entry.input_tokens + entry.cache_read_tokens + entry.cache_write_tokens,
      entry.output_tokens,
      "claude-opus-4-6", // always opus
      region,
    );
    worstCaseCO2 += worstCase;

    // Track model choice savings
    if (!entry.model.toLowerCase().includes("opus")) {
      modelSavings += worstCase - actual;
      smallModelCount++;
    }

    // Track cache efficiency savings
    if (entry.cache_read_tokens > 0) {
      // Cache reads reuse existing context instead of regenerating
      const cacheReuseCO2 = quickCO2(
        entry.cache_read_tokens,
        0,
        entry.model,
        region,
      );
      cacheSavings += cacheReuseCO2 * 0.3; // ~30% savings from cache hits
    }

    totalEntries++;
  }

  const breakdown: SavingsBreakdownItem[] = [];

  if (modelSavings > 0) {
    breakdown.push({
      category: "Smart model choices",
      description: `${smallModelCount} tasks used a lighter model instead of Opus`,
      saved_grams: modelSavings,
    });
  }

  if (cacheSavings > 0) {
    breakdown.push({
      category: "Cache efficiency",
      description: "Token reuse from cache hits",
      saved_grams: cacheSavings,
    });
  }

  const totalSaved = worstCaseCO2 - actualCO2;

  // Determine period from timestamps
  const timestamps = entries.map((e) => e.timestamp).sort();
  const from = timestamps[0]?.slice(0, 10) ?? "unknown";
  const to = timestamps[timestamps.length - 1]?.slice(0, 10) ?? "unknown";
  const period = from === to ? from : `${from} to ${to}`;

  return {
    period,
    actual_co2_grams: actualCO2,
    worst_case_co2_grams: worstCaseCO2,
    saved_co2_grams: Math.max(0, totalSaved),
    savings_breakdown: breakdown,
    lifetime_saved_grams: Math.max(0, totalSaved),
  };
}
