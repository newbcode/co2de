import { ClaudeAdapter } from "../adapters/claude/index.js";
import {
  getEnergyPerToken,
  calculateMetaphors,
} from "../engine/carbon-calculator.js";
import { PUE, CARBON_INTENSITY_GCO2_PER_KWH } from "../core/constants.js";
import { loadConfig } from "../core/config.js";
import { formatCO2 } from "../core/tone.js";
import { colors } from "../renderer/colors.js";
import { renderMetaphors } from "../renderer/components/metaphor-display.js";
import type { TokenUsage } from "../core/types.js";

export async function whyCommand(): Promise<void> {
  const adapter = new ClaudeAdapter();
  const config = loadConfig();
  const region = config.region;

  // Get most recent session
  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);

  const sessions = await adapter.listSessions(dayAgo, now);
  if (sessions.length === 0) {
    console.log(colors.dim("  No recent sessions found."));
    return;
  }

  const latest = sessions[0];
  const entries = await adapter.getSessionUsage(latest.id);

  if (entries.length === 0) {
    console.log(colors.dim("  No token data for this session."));
    return;
  }

  // Aggregate
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let model = "unknown";

  for (const e of entries) {
    totalInput += e.input_tokens;
    totalOutput += e.output_tokens;
    totalCacheRead += e.cache_read_tokens;
    totalCacheWrite += e.cache_write_tokens;
    model = e.model;
  }

  const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheWrite;
  const whPerToken = getEnergyPerToken(model);
  const rawEnergy = totalTokens * whPerToken;
  const totalEnergy = rawEnergy * PUE;
  const energyKwh = totalEnergy / 1000;
  const carbonIntensity = CARBON_INTENSITY_GCO2_PER_KWH[region] ?? CARBON_INTENSITY_GCO2_PER_KWH["global"];
  const co2 = energyKwh * carbonIntensity;
  const metaphors = calculateMetaphors(co2);

  console.log(colors.bold(`\n\u{1F4A8} co2de — Why ${formatCO2(co2)} CO2?\n`));

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
  console.log(`  Model: ${model} \u2192 ${whPerToken} Wh/token (est.)`);
  console.log(`  Raw:   ${totalTokens.toLocaleString()} \u00D7 ${whPerToken} = ${rawEnergy.toFixed(2)} Wh`);
  console.log(`  PUE:   \u00D7 ${PUE} (datacenter overhead)`);
  console.log(`  Total: ${totalEnergy.toFixed(2)} Wh = ${energyKwh.toFixed(4)} kWh`);
  console.log("");

  // Step 3
  console.log(colors.bold("STEP 3: Carbon Emission"));
  console.log(`  Region: ${region} \u2192 ${carbonIntensity} gCO2/kWh`);
  console.log(`  CO2:    ${energyKwh.toFixed(4)} \u00D7 ${carbonIntensity} = ${colors.bold(formatCO2(co2))} CO2e`);
  console.log("");

  // Model suggestion
  console.log(colors.bold("MODEL SUGGESTION"));
  const sonnetCO2 = (totalTokens * 0.0025 * PUE / 1000) * carbonIntensity;
  const haikuCO2 = (totalTokens * 0.001 * PUE / 1000) * carbonIntensity;
  console.log(`  If Sonnet:  ~${formatCO2(sonnetCO2)} (${((1 - sonnetCO2 / co2) * 100).toFixed(0)}% less)`);
  console.log(`  If Haiku:   ~${formatCO2(haikuCO2)} (${((1 - haikuCO2 / co2) * 100).toFixed(0)}% less)`);
  console.log(colors.dim("  Was this model necessary for this task?"));
  console.log("");

  // Comparisons
  console.log(colors.bold("COMPARISONS"));
  console.log(renderMetaphors(metaphors));
  console.log("");

  console.log(colors.dim("Sources: IEA 2023, Luccioni et al. 2023, EPA 2024"));
  console.log(colors.dim("Coefficients are estimates. Run 'co2de config' to adjust."));
  console.log("");
}
