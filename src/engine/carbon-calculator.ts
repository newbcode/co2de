import type { TokenUsage, CarbonResult, MetaphorSet } from "../core/types.js";
import {
  ENERGY_PER_TOKEN_WH,
  PUE,
  CARBON_INTENSITY_GCO2_PER_KWH,
  METAPHORS,
} from "../core/constants.js";

/**
 * Resolve the energy-per-token coefficient for a given model ID.
 * Matches known prefixes (opus, sonnet, haiku, etc.) and falls back to default.
 */
export function getEnergyPerToken(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("opus")) return ENERGY_PER_TOKEN_WH["claude-opus"];
  if (m.includes("sonnet")) return ENERGY_PER_TOKEN_WH["claude-sonnet"];
  if (m.includes("haiku")) return ENERGY_PER_TOKEN_WH["claude-haiku"];
  if (m.includes("gemini") && m.includes("pro"))
    return ENERGY_PER_TOKEN_WH["gemini-pro"];
  if (m.includes("gemini") && m.includes("flash"))
    return ENERGY_PER_TOKEN_WH["gemini-flash"];
  return ENERGY_PER_TOKEN_WH["default"];
}

/**
 * Calculate carbon emissions from token usage.
 *
 * Pipeline: tokens → energy (Wh) → CO2 (grams) → metaphors
 */
export function calculateCarbon(
  usage: TokenUsage,
  region = "global",
): CarbonResult {
  const totalTokens =
    usage.input_tokens +
    usage.output_tokens +
    usage.cache_read_tokens +
    usage.cache_write_tokens;

  // Step 1: tokens → energy
  const whPerToken = getEnergyPerToken(usage.model);
  const rawEnergyWh = totalTokens * whPerToken;
  const energyWh = rawEnergyWh * PUE;

  // Step 2: energy → CO2
  const carbonIntensity =
    CARBON_INTENSITY_GCO2_PER_KWH[region] ??
    CARBON_INTENSITY_GCO2_PER_KWH["global"];
  const co2Grams = (energyWh / 1000) * carbonIntensity;

  // Step 3: CO2 → metaphors
  const equivalents = calculateMetaphors(co2Grams);

  return {
    usage,
    energy_wh: energyWh,
    co2_grams: co2Grams,
    equivalents,
  };
}

/**
 * Calculate metaphor equivalents for a given CO2 amount.
 */
export function calculateMetaphors(co2Grams: number): MetaphorSet {
  const secondsInYear = 365.25 * 24 * 3600;

  return {
    // How many seconds a tree needs to absorb this CO2
    tree_absorption_seconds:
      (co2Grams / METAPHORS.tree_annual_absorption_grams) * secondsInYear,

    // Distance a car would drive to emit this CO2 (in meters)
    car_drive_meters: (co2Grams / METAPHORS.car_grams_per_km) * 1000,

    // Number of smartphone charges
    phone_charges: co2Grams / METAPHORS.phone_charge_grams,

    // Number of Google searches
    google_searches: co2Grams / METAPHORS.google_search_grams,

    // Seconds of Netflix streaming
    netflix_streaming_seconds:
      (co2Grams / METAPHORS.netflix_hour_grams) * 3600,

    // Hours of LED bulb usage
    led_bulb_hours: co2Grams / METAPHORS.led_bulb_hour_grams,
  };
}

/**
 * Calculate CO2 for a simple token count (used by statusline and quick summaries).
 */
export function quickCO2(
  inputTokens: number,
  outputTokens: number,
  model: string,
  region = "global",
): number {
  const totalTokens = inputTokens + outputTokens;
  const whPerToken = getEnergyPerToken(model);
  const energyWh = totalTokens * whPerToken * PUE;
  const carbonIntensity =
    CARBON_INTENSITY_GCO2_PER_KWH[region] ??
    CARBON_INTENSITY_GCO2_PER_KWH["global"];
  return (energyWh / 1000) * carbonIntensity;
}

/**
 * Aggregate multiple CarbonResults into a total.
 */
export function aggregateResults(results: CarbonResult[]): {
  total_tokens: number;
  total_energy_wh: number;
  total_co2_grams: number;
  equivalents: MetaphorSet;
} {
  let totalTokens = 0;
  let totalEnergyWh = 0;
  let totalCo2 = 0;

  for (const r of results) {
    totalTokens +=
      r.usage.input_tokens +
      r.usage.output_tokens +
      r.usage.cache_read_tokens +
      r.usage.cache_write_tokens;
    totalEnergyWh += r.energy_wh;
    totalCo2 += r.co2_grams;
  }

  return {
    total_tokens: totalTokens,
    total_energy_wh: totalEnergyWh,
    total_co2_grams: totalCo2,
    equivalents: calculateMetaphors(totalCo2),
  };
}
