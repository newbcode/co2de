import { calculateSavings } from "../engine/savings-tracker.js";
import { computePace } from "../engine/pace.js";
import { colors } from "../renderer/colors.js";
import { approxCO2, precisionBar, sectionHeader, coloredCO2, fmtPace } from "../renderer/format.js";
import { createContext, daysAgo, collectAllEntries } from "./shared.js";

/**
 * Emission range audit — the honest version of "savings".
 *
 * Previous framing celebrated a percentage saved against a hypothetical worst
 * case. That triggers moral licensing (Schultz/Opower): users who see a green
 * "88% saved" badge compensate by using more afterwards.
 *
 * New framing presents the same data as three bounded facts:
 *   1. Your actual emissions (what happened)
 *   2. IF-WORST ceiling  (hypothetical: all-opus, zero cache)
 *   3. The gap, broken down by source
 *
 * No verdicts, no congratulations, no green "saved" label. The gap breakdown
 * stays informational — it says "these components are already low-cost",
 * not "you won."
 */
export async function savingsCommand(): Promise<void> {
  const { config, adapter } = createContext();
  const now = new Date();

  const sessions = await adapter.listSessions(daysAgo(7), now);
  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions this week."));
    return;
  }

  const allEntries = await collectAllEntries(adapter, sessions);
  const report = calculateSavings(allEntries, config.region);
  const pace = computePace(sessions);

  const actual = report.actual_co2_grams;
  const worst = report.worst_case_co2_grams;
  const gap = report.saved_co2_grams;

  const barWidth = 20;

  console.log(sectionHeader("CARBON RANGE AUDIT", "Past 7 Days"));
  console.log("");

  // YOUR WEEK — actual, neutral color
  console.log(
    `  YOUR WEEK   ${precisionBar(actual, worst, barWidth, colors.yellow)}  ${coloredCO2(actual)}`,
  );
  // IF-WORST — hypothetical ceiling, red-framed as a bound not a threat
  console.log(
    `  IF-WORST*   ${precisionBar(worst, worst, barWidth, colors.red)}  ${approxCO2(worst)} ${colors.dim("all-opus, no cache")}`,
  );
  // GAP — the difference, neutral
  if (gap > 0) {
    console.log(
      `  GAP         ${precisionBar(gap, worst, barWidth, colors.dim)}  ${approxCO2(gap)} ${colors.dim("same workload, different habits")}`,
    );
  }

  // Breakdown — factual, no celebration color
  if (report.savings_breakdown.length > 0) {
    console.log(sectionHeader("GAP BREAKDOWN"));
    console.log("");

    const maxSaved = Math.max(...report.savings_breakdown.map((b) => b.saved_grams));
    const labelWidth = 21;
    const breakdownBarWidth = 14;

    for (const item of report.savings_breakdown) {
      const label = item.category.padEnd(labelWidth);
      const bar = precisionBar(item.saved_grams, maxSaved, breakdownBarWidth, colors.dim);
      console.log(`  ${label}${bar}  ${approxCO2(item.saved_grams)}`);
    }
  }

  // Cache context — observation, not cheerleading
  const totalCR = allEntries.reduce((s, e) => s + e.cache_read_tokens, 0);
  const totalInput = allEntries.reduce((s, e) => s + e.input_tokens + e.cache_write_tokens + e.cache_read_tokens, 0);
  const cacheHit = totalInput > 0 ? (totalCR / totalInput) * 100 : 0;

  console.log("");
  console.log(`  Cache hit rate: ${cacheHit.toFixed(0)}% ${colors.dim("— determined by client + TTL, not prompts")}`);

  // Pace — escape the "one week = trivial" dismissal
  if (pace.weekly_grams > 0) {
    console.log(`  At this rate: ${colors.bold(fmtPace(pace.annual_grams))}`);
  }

  // Explanation
  console.log("");
  console.log(colors.dim("  YOUR WEEK  cache reads at 10% energy + real model"));
  console.log(colors.dim("  IF-WORST*  hypothetical ceiling — all Opus, no cache"));
  console.log(colors.dim("  GAP        IF-WORST − YOUR WEEK · shows the range, not a claim of savings"));
  console.log(colors.dim("  * Most workloads would never reach IF-WORST."));
  console.log("");
}
