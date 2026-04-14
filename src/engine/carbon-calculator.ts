import type { TokenUsage, CarbonResult, MetaphorSet } from "../core/types.js";
import {
  ENERGY_PER_TOKEN_WH,
  COST_PER_1M_TOKENS,
  PUE,
  CACHE_READ_ENERGY_FACTOR,
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
  // Step 1: tokens → energy
  // Cache reads skip prefill computation → use CACHE_READ_ENERGY_FACTOR of normal energy
  const whPerToken = getEnergyPerToken(usage.model);
  const fullPriceTokens = usage.input_tokens + usage.output_tokens + usage.cache_write_tokens;
  const rawEnergyWh =
    fullPriceTokens * whPerToken +
    usage.cache_read_tokens * whPerToken * CACHE_READ_ENERGY_FACTOR;
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
 * Resolve cost rates for a given model.
 */
function getCostRates(model: string): { input: number; output: number; cache_read: number } {
  const m = model.toLowerCase();
  if (m.includes("opus")) return COST_PER_1M_TOKENS["claude-opus"];
  if (m.includes("sonnet")) return COST_PER_1M_TOKENS["claude-sonnet"];
  if (m.includes("haiku")) return COST_PER_1M_TOKENS["claude-haiku"];
  if (m.includes("gemini") && m.includes("pro")) return COST_PER_1M_TOKENS["gemini-pro"];
  if (m.includes("gemini") && m.includes("flash")) return COST_PER_1M_TOKENS["gemini-flash"];
  return COST_PER_1M_TOKENS["default"];
}

/**
 * Calculate USD cost from token usage.
 */
export function calculateCost(usage: TokenUsage): number {
  const rates = getCostRates(usage.model);
  const inputCost = (usage.input_tokens / 1_000_000) * rates.input;
  const outputCost = (usage.output_tokens / 1_000_000) * rates.output;
  const cacheReadCost = (usage.cache_read_tokens / 1_000_000) * rates.cache_read;
  const cacheWriteCost = (usage.cache_write_tokens / 1_000_000) * rates.input; // cache writes charged at input rate
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}


