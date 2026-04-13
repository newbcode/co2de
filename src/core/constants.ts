/**
 * Energy consumption per token (Wh) by model family.
 *
 * These are conservative estimates based on:
 * - IEA "Electricity 2024" report on datacenter energy
 * - Luccioni et al. (2023) "Power Hungry Processing" — energy measurements of LLM inference
 * - Strubell et al. (2019) "Energy and Policy Considerations for Deep Learning in NLP"
 * - Patterson et al. (2021) "Carbon Emissions and Large Neural Networks"
 *
 * Actual values vary by hardware (GPU type), batch size, quantization, and datacenter efficiency.
 * We use upper-bound estimates because underestimating defeats the tool's awareness purpose.
 */
export const ENERGY_PER_TOKEN_WH: Record<string, number> = {
  // Claude models
  "claude-opus": 0.005, // Large model, highest energy per token
  "claude-sonnet": 0.0025, // Mid-size, balanced
  "claude-haiku": 0.001, // Small, optimized for speed/efficiency

  // Gemini models (for future adapter support)
  "gemini-pro": 0.004,
  "gemini-flash": 0.0015,

  // Default fallback
  default: 0.003,
};

/**
 * Power Usage Effectiveness (PUE) — datacenter overhead multiplier.
 *
 * PUE accounts for cooling, networking, storage, and other infrastructure
 * that consumes energy beyond the compute hardware itself.
 *
 * Source: Uptime Institute Global Data Center Survey 2023
 * - Google: ~1.10
 * - AWS: ~1.20
 * - Industry average: ~1.58
 *
 * We use 1.2 as a reasonable estimate for hyperscaler datacenters.
 */
export const PUE = 1.2;

/**
 * Carbon intensity by region (gCO2 per kWh of electricity).
 *
 * Source: IEA "CO2 Emissions from Fuel Combustion" 2023
 * - Reflects the energy mix (coal, gas, nuclear, renewables) of each grid
 * - Lower values = cleaner grid (more renewables/nuclear)
 *
 * Users can override with `co2de config set region <code>`.
 */
export const CARBON_INTENSITY_GCO2_PER_KWH: Record<string, number> = {
  global: 475, // World average
  us: 390,
  eu: 230,
  uk: 210,
  de: 350, // Germany — still significant coal
  fr: 55, // France — mostly nuclear
  se: 25, // Sweden — hydro + nuclear
  no: 10, // Norway — almost all hydro
  kr: 415, // South Korea
  jp: 450, // Japan
  cn: 555, // China
  in: 630, // India
  au: 510, // Australia
  ca: 120, // Canada — lots of hydro
  br: 75, // Brazil — hydro-dominated
};

/**
 * Metaphor conversion factors — making grams of CO2 relatable.
 *
 * Sources:
 * - EPA "Greenhouse Gas Equivalencies Calculator" (2024)
 * - IEA Energy Statistics
 * - Various peer-reviewed lifecycle assessments
 */
export const METAPHORS = {
  /** A mature tree absorbs ~22kg CO2 per year. Source: US Forest Service */
  tree_annual_absorption_grams: 22_000,

  /** Average passenger car emits ~120g CO2 per km. Source: EPA 2024 */
  car_grams_per_km: 120,

  /** Charging a smartphone uses ~8.22 Wh → ~3.9g CO2 at global avg. We round to 8g for the full lifecycle. Source: IEA */
  phone_charge_grams: 8,

  /** A single Google search uses ~0.2g CO2. Source: Google Environmental Report 2024 */
  google_search_grams: 0.2,

  /** 1 hour of Netflix streaming uses ~36g CO2. Source: IEA, The Shift Project */
  netflix_hour_grams: 36,

  /** A 10W LED bulb for 1 hour at global avg grid intensity. 0.01 kWh × 475 = 4.75g, rounded to ~10g with lifecycle */
  led_bulb_hour_grams: 10,
};

/**
 * Hand-coding estimation constants.
 *
 * Sources:
 * - Average typing speed for code: ~3 lines/min (experienced developer)
 *   Source: "Measuring Programming Productivity" — various studies average 10-50 LOC/hour for production code
 *   We use a generous 3 lines/min for raw typing (not production-quality)
 * - Laptop power consumption: ~30W average (MacBook Pro under light load)
 *   Source: Apple Environment Report, measured at wall
 */
export const HANDCODE = {
  /** Lines of code per minute (experienced developer, raw typing) */
  lines_per_minute: 3,

  /** Laptop power consumption in watts */
  laptop_watts: 30,
};

/**
 * Carbon offset cost estimates (USD per gram CO2).
 *
 * Sources:
 * - One Tree Planted: ~$1 per tree, each absorbs ~22kg CO2/year over ~40 years
 * - Gold Standard carbon credits: ~$10-30 per ton CO2
 * - Renewable Energy Certificates: ~$2-5 per MWh
 */
export const OFFSET_COST = {
  /** USD per gram CO2 via tree planting */
  tree_planting_usd_per_gram: 0.00035,

  /** USD per gram CO2 via carbon credits */
  carbon_credit_usd_per_gram: 0.00007,

  /** USD per gram CO2 via renewable energy certificates */
  renewable_cert_usd_per_gram: 0.00002,
};
