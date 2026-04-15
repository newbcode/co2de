import {
  getEnergyPerToken,
  calculateMetaphors,
} from "../engine/carbon-calculator.js";
import { PUE, CACHE_READ_ENERGY_FACTOR, CARBON_INTENSITY_GCO2_PER_KWH } from "../core/constants.js";
import { getEmissionLevel } from "../core/tone.js";
import { colors, colorForLevel } from "../renderer/colors.js";
import { renderMetaphors } from "../renderer/display.js";
import { fmtCO2, precisionBar } from "../renderer/format.js";
import { createContext, getLatestSession } from "./shared.js";

export async function whyCommand(): Promise<void> {
  const { config, adapter } = createContext();
  const region = config.region;

  const result = await getLatestSession(adapter);
  if (!result) {
    console.log(colors.dim("  No recent sessions found."));
    return;
  }

  const { entries } = result;

  // Aggregate — track per-model token counts to use the dominant model
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  const modelTokenCounts = new Map<string, number>();

  for (const e of entries) {
    totalInput += e.input_tokens;
    totalOutput += e.output_tokens;
    totalCacheRead += e.cache_read_tokens;
    totalCacheWrite += e.cache_write_tokens;
    const entryTotal = e.input_tokens + e.output_tokens + e.cache_read_tokens + e.cache_write_tokens;
    modelTokenCounts.set(e.model, (modelTokenCounts.get(e.model) ?? 0) + entryTotal);
  }

  // Use the model with the most tokens (not just the last one)
  let model = "unknown";
  let maxTokens = 0;
  for (const [m, count] of modelTokenCounts) {
    if (count > maxTokens) { model = m; maxTokens = count; }
  }

  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheWrite;
  const fullPriceTokens = totalInput + totalOutput + totalCacheWrite;
  const whPerToken = getEnergyPerToken(model);
  const fullPriceEnergy = fullPriceTokens * whPerToken;
  const cacheReadEnergy = totalCacheRead * whPerToken * CACHE_READ_ENERGY_FACTOR;
  const rawEnergy = fullPriceEnergy + cacheReadEnergy;
  const totalEnergy = rawEnergy * PUE;
  const energyKwh = totalEnergy / 1000;
  const carbonIntensity = CARBON_INTENSITY_GCO2_PER_KWH[region] ?? CARBON_INTENSITY_GCO2_PER_KWH["global"];
  const co2 = energyKwh * carbonIntensity;
  const metaphors = calculateMetaphors(co2);

  console.log(colors.bold(`\n\u{1F4A8} co2de — Why ${fmtCO2(co2)} CO2?\n`));

  // Step 1
  console.log(colors.bold("STEP 1: Token Count"));
  console.log(`  Input:    ${totalInput.toLocaleString().padStart(10)} tokens (prompt, context)`);
  console.log(`  Output:   ${totalOutput.toLocaleString().padStart(10)} tokens (model responses)`);
  if (totalCacheRead > 0) {
    console.log(`  Cache R:  ${totalCacheRead.toLocaleString().padStart(10)} tokens (reused context)`);
  }
  if (totalCacheWrite > 0) {
    console.log(`  Cache W:  ${totalCacheWrite.toLocaleString().padStart(10)} tokens (new context)`);
  }
  console.log(`  Total:    ${totalTokens.toLocaleString().padStart(10)} tokens`);
  console.log("");

  // Step 2
  console.log(colors.bold("STEP 2: Energy Consumption"));
  console.log(`  Model: ${model} \u2192 ${whPerToken} Wh/token`);
  console.log(`  Full-price tokens: ${fullPriceTokens.toLocaleString()} \u00D7 ${whPerToken} = ${fullPriceEnergy.toFixed(2)} Wh`);
  if (totalCacheRead > 0) {
    console.log(`  Cache-read tokens: ${totalCacheRead.toLocaleString()} \u00D7 ${whPerToken} \u00D7 ${CACHE_READ_ENERGY_FACTOR} = ${cacheReadEnergy.toFixed(2)} Wh ${colors.dim("(90% discount)")}`);
  }
  console.log(`  PUE:   \u00D7 ${PUE} (datacenter overhead)`);
  console.log(`  Total: ${totalEnergy.toFixed(2)} Wh = ${energyKwh.toFixed(4)} kWh`);
  console.log("");

  // Step 3
  console.log(colors.bold("STEP 3: Carbon Emission"));
  console.log(`  Region: ${region} \u2192 ${carbonIntensity} gCO2/kWh`);
  console.log(`  CO2:    ${energyKwh.toFixed(4)} \u00D7 ${carbonIntensity} = ${colors.bold(fmtCO2(co2))} CO2e`);
  console.log("");

  // Model suggestion
  console.log(colors.bold("MODEL SUGGESTION"));
  const sonnetWh = getEnergyPerToken("claude-sonnet");
  const haikuWh = getEnergyPerToken("claude-haiku");
  const sonnetCO2 = ((fullPriceTokens * sonnetWh + totalCacheRead * sonnetWh * CACHE_READ_ENERGY_FACTOR) * PUE / 1000) * carbonIntensity;
  const haikuCO2 = ((fullPriceTokens * haikuWh + totalCacheRead * haikuWh * CACHE_READ_ENERGY_FACTOR) * PUE / 1000) * carbonIntensity;
  console.log(`  If Sonnet:  ~${fmtCO2(sonnetCO2)} (${((1 - sonnetCO2 / co2) * 100).toFixed(0)}% less)`);
  console.log(`  If Haiku:   ~${fmtCO2(haikuCO2)} (${((1 - haikuCO2 / co2) * 100).toFixed(0)}% less)`);
  console.log(colors.dim("  Was this model necessary for this task?"));
  console.log("");

  // Comparisons
  console.log(colors.bold("COMPARISONS"));
  console.log(renderMetaphors(metaphors));
  console.log("");

  // Regional impact
  const defaultCompare: Array<{ code: string; label: string }> = [
    { code: "fr", label: "France (nuclear)" },
    { code: "no", label: "Norway (hydro)" },
    { code: "in", label: "India (coal-heavy)" },
  ];
  // If user's region is one of the defaults, swap it with a different region
  const replacements: Record<string, { code: string; label: string }> = {
    fr: { code: "se", label: "Sweden (hydro+nuclear)" },
    no: { code: "se", label: "Sweden (hydro+nuclear)" },
    in: { code: "cn", label: "China (coal-heavy)" },
  };
  const compareRegions = defaultCompare.map((r) =>
    r.code === region ? (replacements[r.code] ?? r) : r,
  );

  const userIntensity = CARBON_INTENSITY_GCO2_PER_KWH[region] ?? CARBON_INTENSITY_GCO2_PER_KWH["global"];
  const regionEntries = [
    { label: `Your region (${region})`, co2g: energyKwh * userIntensity, intensity: userIntensity, diff: null as number | null },
    ...compareRegions.map((r) => {
      const intensity = CARBON_INTENSITY_GCO2_PER_KWH[r.code] ?? CARBON_INTENSITY_GCO2_PER_KWH["global"];
      const rCo2 = energyKwh * intensity;
      const pctDiff = ((rCo2 - co2) / co2) * 100;
      return { label: r.label, co2g: rCo2, intensity, diff: pctDiff };
    }),
  ];
  const maxRegionCO2 = Math.max(...regionEntries.map((r) => r.co2g));
  const barWidth = 20;

  console.log(colors.bold("REGIONAL IMPACT") + colors.dim(" — Same tokens, different grids"));
  for (const entry of regionEntries) {
    const bar = precisionBar(entry.co2g, maxRegionCO2, barWidth, colorForLevel(getEmissionLevel(entry.co2g)));
    const co2Str = fmtCO2(entry.co2g).padStart(7);
    const intensityStr = `${entry.intensity} gCO2/kWh`;
    const diffStr = entry.diff === null
      ? ""
      : `  ${entry.diff > 0 ? "+" : ""}${entry.diff.toFixed(0)}%`;
    console.log(`  ${entry.label.padEnd(20)}${bar}  ${co2Str}   ${intensityStr}${diffStr}`);
  }
  console.log("");
  console.log(colors.dim("  Anthropic's US datacenter grid: ~390 gCO2/kWh."));
  console.log(colors.dim("  Your region setting affects the DISPLAY only — actual emissions"));
  console.log(colors.dim("  depend on where the provider runs inference."));
  console.log("");

  // Sources
  console.log(colors.dim("Sources: IEA 2023, Luccioni et al. 2023, EPA 2024"));
  console.log(colors.dim("Coefficients are estimates. Run 'co2de config' to adjust."));
  console.log("");

  // Methodology limitation note
  console.log(colors.dim("  NOTE"));
  console.log(colors.dim("  Token-based CO2 is an approximation (R\u00B2\u22480.44 vs actual energy)."));
  console.log(colors.dim("  Inference time is a stronger predictor but unavailable via API."));
  console.log(colors.dim("  Source: Mamun et al. 2026, arXiv:2604.02776"));
  console.log("");
}
