import { ClaudeAdapter } from "../adapters/claude/index.js";
import { loadConfig } from "../core/config.js";
import { formatCO2, getToneMessage } from "../core/tone.js";
import { colors } from "../renderer/colors.js";
import { renderMetaphors } from "../renderer/components/metaphor-display.js";
import { calculateMetaphors } from "../engine/carbon-calculator.js";
import { estimateHandCoding, estimateLinesFromTokens } from "../engine/handcode-estimator.js";
import { renderBarChart } from "../renderer/components/bar-chart.js";
import { basename } from "node:path";

export async function projectCommand(): Promise<void> {
  const adapter = new ClaudeAdapter();
  const config = loadConfig();
  const projectPath = process.cwd();
  const projectName = basename(projectPath);

  const sessions = await adapter.getProjectSessions(projectPath);

  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions found for this project."));
    return;
  }

  // Aggregate
  let totalTokens = 0;
  let totalCO2 = 0;
  const dates = sessions.map((s) => s.timestamp.slice(0, 10));
  const uniqueDates = [...new Set(dates)].sort();

  for (const s of sessions) {
    totalTokens += s.total_tokens;
    totalCO2 += s.co2_grams;
  }

  const tone = getToneMessage(totalCO2);
  const metaphors = calculateMetaphors(totalCO2);

  // Estimate total output tokens for hand-coding comparison
  const totalOutputEstimate = totalTokens * 0.3; // rough: ~30% are output tokens
  const linesEstimate = estimateLinesFromTokens(totalOutputEstimate);

  console.log(colors.bold(`\n${tone.statusline_icon} Project Carbon Footprint: ${projectName}`));
  console.log(colors.dim(`   Path: ${projectPath}`));
  console.log("");
  console.log(`  Sessions: ${sessions.length} (over ${uniqueDates.length} days)`);
  console.log(`  Tokens:   ${totalTokens.toLocaleString()}`);
  console.log(`  CO2:      ${formatCO2(totalCO2)} (estimated)`);
  console.log("");

  // Date range
  if (uniqueDates.length > 1) {
    console.log(colors.dim(`  Period: ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`));
    console.log("");
  }

  // Equivalents
  console.log(colors.bold("  Equivalent to:"));
  console.log(renderMetaphors(metaphors));
  console.log("");

  // Hand-coding comparison
  if (linesEstimate > 0) {
    const handCO2 = estimateHandCoding(
      linesEstimate,
      totalCO2,
      totalTokens,
      sessions.length * 15, // rough estimate
      config.region,
    );
    console.log(
      colors.dim(
        `  If hand-coded: ~${formatCO2(handCO2.hand_co2_grams)} CO2 (${handCO2.multiplier.toFixed(0)}x less, ~${(handCO2.hand_time_minutes / 60).toFixed(0)} hours longer)`,
      ),
    );
    console.log("");
  }
}
