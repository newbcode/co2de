import type { CodingComparison } from "../core/types.js";
import {
  HANDCODE,
  CARBON_INTENSITY_GCO2_PER_KWH,
} from "../core/constants.js";

/**
 * Estimate the carbon footprint of writing the same code by hand.
 *
 * Hand coding CO2 comes only from laptop electricity:
 *   time_hours = lines / (lines_per_minute × 60)
 *   energy_kwh = time_hours × laptop_watts / 1000
 *   co2_grams  = energy_kwh × carbon_intensity
 *
 * This is a rough estimate. Real hand-coding involves thinking time,
 * Stack Overflow browsing, coffee breaks, etc. We estimate raw typing
 * time only, which underestimates actual time but gives a fair comparison
 * of the energy used for the code-writing activity itself.
 */
export function estimateHandCoding(
  linesOfCode: number,
  aiCo2Grams: number,
  aiTokens: number,
  aiTimeMinutes: number,
  region = "global",
): CodingComparison {
  // Hand-coding time estimate
  const handTimeMinutes = linesOfCode / HANDCODE.lines_per_minute;
  const handTimeHours = handTimeMinutes / 60;

  // Hand-coding energy: laptop power × time
  const handEnergyKwh = (handTimeHours * HANDCODE.laptop_watts) / 1000;

  // Hand-coding CO2
  const carbonIntensity =
    CARBON_INTENSITY_GCO2_PER_KWH[region] ??
    CARBON_INTENSITY_GCO2_PER_KWH["global"];
  const handCo2Grams = handEnergyKwh * carbonIntensity;

  // Multiplier (avoid division by zero)
  const multiplier = handCo2Grams > 0 ? aiCo2Grams / handCo2Grams : 0;

  return {
    ai_co2_grams: aiCo2Grams,
    ai_time_minutes: aiTimeMinutes,
    ai_tokens: aiTokens,
    hand_co2_grams: handCo2Grams,
    hand_time_minutes: handTimeMinutes,
    lines_of_code: linesOfCode,
    multiplier,
  };
}

/**
 * Estimate lines of code from token count.
 *
 * When we can't count actual Write/Edit operations from JSONL,
 * we fall back to a token-based estimate.
 *
 * Rough heuristic: ~4 tokens per line of code on average
 * (based on analysis of typical code output in assistant messages).
 * We use output_tokens only since input_tokens are prompts.
 */
export function estimateLinesFromTokens(outputTokens: number): number {
  const TOKENS_PER_LINE = 4;
  return Math.round(outputTokens / TOKENS_PER_LINE);
}
