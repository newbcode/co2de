import type {
  TokenUsage,
  SavingsReport,
  SavingsBreakdownItem,
} from "../core/types.js";
import { calculateCarbon } from "./carbon-calculator.js";

/**
 * Calculate carbon savings by comparing actual usage against a worst-case baseline.
 *
 * ## Methodology
 *
 * ACTUAL:  CO2 from real usage. Cache reads use ~10% energy (CACHE_READ_ENERGY_FACTOR).
 * WORST:   CO2 if (1) all responses used Opus AND (2) no cache — every token at full energy.
 * SAVED:   WORST − ACTUAL = cache efficiency savings + model choice savings.
 *
 * ## Breakdown
 * - Cache reuse: cache_read tokens served at 10% energy instead of 100%
 * - Lighter models: Sonnet/Haiku instead of Opus
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

  let actualCO2 = 0;
  let worstCaseCO2 = 0;
  let modelSavingsGrams = 0;
  let cacheSavingsGrams = 0;
  let smallModelCount = 0;

  for (const entry of entries) {
    // ── Actual: real model, cache_read at discounted energy ──
    const actual = calculateCarbon(entry, region);
    actualCO2 += actual.co2_grams;

    // ── Worst-case: Opus + no cache discount ──
    // Move cache_read into input (full price) and zero out cache_read
    const worstEntry: TokenUsage = {
      ...entry,
      model: "claude-opus-4-6",
      input_tokens: entry.input_tokens + entry.cache_read_tokens,
      cache_read_tokens: 0,
    };
    const worst = calculateCarbon(worstEntry, region);
    worstCaseCO2 += worst.co2_grams;

    // ── Model savings: what if this entry used opus (but kept cache discount)? ──
    if (!entry.model.toLowerCase().includes("opus")) {
      const asOpus = calculateCarbon({ ...entry, model: "claude-opus-4-6" }, region);
      modelSavingsGrams += asOpus.co2_grams - actual.co2_grams;
      smallModelCount++;
    }

    // ── Cache savings: worst(no cache) - same model with cache ──
    if (entry.cache_read_tokens > 0) {
      const sameModelNoCache: TokenUsage = {
        ...entry,
        input_tokens: entry.input_tokens + entry.cache_read_tokens,
        cache_read_tokens: 0,
      };
      const noCache = calculateCarbon(sameModelNoCache, region);
      cacheSavingsGrams += noCache.co2_grams - actual.co2_grams;
    }
  }

  const totalSaved = Math.max(0, worstCaseCO2 - actualCO2);

  // ── Breakdown ──
  const breakdown: SavingsBreakdownItem[] = [];

  if (cacheSavingsGrams > 0) {
    breakdown.push({
      category: "Cache reuse",
      description: "Cached tokens served at ~10% energy cost",
      saved_grams: cacheSavingsGrams,
    });
  }

  if (modelSavingsGrams > 0) {
    breakdown.push({
      category: "Lighter models",
      description: `${smallModelCount} responses used Sonnet/Haiku instead of Opus`,
      saved_grams: modelSavingsGrams,
    });
  }

  // ── Period ──
  const timestamps = entries.map((e) => e.timestamp).sort();
  const from = timestamps[0]?.slice(0, 10) ?? "unknown";
  const to = timestamps[timestamps.length - 1]?.slice(0, 10) ?? "unknown";
  const period = from === to ? from : `${from} to ${to}`;

  return {
    period,
    actual_co2_grams: actualCO2,
    worst_case_co2_grams: worstCaseCO2,
    saved_co2_grams: totalSaved,
    savings_breakdown: breakdown,
    lifetime_saved_grams: totalSaved,
  };
}
