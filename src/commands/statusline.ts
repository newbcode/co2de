import { ClaudeAdapter } from "../adapters/claude.js";
import { calculateCarbon, calculateCost } from "../engine/carbon-calculator.js";
import { calculateBurnRate } from "../engine/burn-rate.js";
import { loadConfig } from "../core/config.js";
import { fmtCO2 } from "../renderer/format.js";
import type { TokenUsage } from "../core/types.js";

/**
 * Output a single formatted line for statusline integration.
 * Designed to be called from Claude Code's statusline-command.sh.
 */
export async function statuslineCommand(): Promise<void> {
  const config = loadConfig();
  const adapter = new ClaudeAdapter(config.region);
  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);

  const sessions = await adapter.listSessions(dayAgo, now);
  if (sessions.length === 0) {
    console.log("CO2 --");
    return;
  }

  const latest = sessions[0];
  const entries = await adapter.getSessionUsage(latest.id);

  if (entries.length === 0) {
    console.log("CO2 --");
    return;
  }

  const aggregated: TokenUsage = {
    input_tokens: entries.reduce((s, e) => s + e.input_tokens, 0),
    output_tokens: entries.reduce((s, e) => s + e.output_tokens, 0),
    cache_read_tokens: entries.reduce((s, e) => s + e.cache_read_tokens, 0),
    cache_write_tokens: entries.reduce((s, e) => s + e.cache_write_tokens, 0),
    model: entries[entries.length - 1].model,
    provider: "claude",
    timestamp: entries[0].timestamp,
    session_id: latest.id,
  };

  const result = calculateCarbon(aggregated, config.region);
  const cost = calculateCost(aggregated);
  const burnRate = calculateBurnRate(entries, config.region);

  let output = `CO2 ${fmtCO2(result.co2_grams)} | $${cost.toFixed(2)}`;

  if (burnRate) {
    output += ` | ${fmtCO2(burnRate.co2_per_hour)}/hr`;
  }

  console.log(output);
}
