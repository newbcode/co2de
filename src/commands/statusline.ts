import { calculateCarbon, calculateCost } from "../engine/carbon-calculator.js";
import { calculateBurnRate } from "../engine/burn-rate.js";
import { fmtCO2, approxCO2 } from "../renderer/format.js";
import { createContext, getLatestSession, aggregateTokenUsage } from "./shared.js";

/**
 * Output a single formatted line for statusline integration.
 * Designed to be called from Claude Code's statusline-command.sh.
 */
export async function statuslineCommand(): Promise<void> {
  const { config, adapter } = createContext();

  const latest = await getLatestSession(adapter);
  if (!latest) {
    console.log("CO\u2082 --");
    return;
  }

  const { entries } = latest;
  const aggregated = aggregateTokenUsage(entries);

  const result = calculateCarbon(aggregated, config.region);
  const cost = calculateCost(aggregated);
  const burnRate = calculateBurnRate(entries, config.region);

  let output = `CO\u2082 ${approxCO2(result.co2_grams)} | $${cost.toFixed(2)}`;

  if (burnRate) {
    output += ` | ${approxCO2(burnRate.co2_per_hour)}/hr`;
  }

  console.log(output);
}
