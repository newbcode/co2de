import { ClaudeAdapter } from "../adapters/claude.js";
import { calculateSavings } from "../engine/savings-tracker.js";
import { loadConfig } from "../core/config.js";
import { colors } from "../renderer/colors.js";
import { fmtCO2, precisionBar, sectionHeader, coloredCO2 } from "../renderer/format.js";

export async function savingsCommand(): Promise<void> {
  const config = loadConfig();
  const adapter = new ClaudeAdapter(config.region);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const sessions = await adapter.listSessions(weekAgo, now);
  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions this week."));
    return;
  }

  // Gather all token entries
  const allEntries = [];
  for (const s of sessions) {
    const entries = await adapter.getSessionUsage(s.id);
    allEntries.push(...entries);
  }

  const report = calculateSavings(allEntries, config.region);

  const actual = report.actual_co2_grams;
  const worst = report.worst_case_co2_grams;
  const saved = report.saved_co2_grams;
  const pct = worst > 0 ? Math.round((saved / worst) * 100) : 0;

  const barWidth = 20;

  console.log(sectionHeader("CARBON SAVINGS", "Past 7 Days"));
  console.log("");

  // ACTUAL bar
  console.log(
    `  ACTUAL    ${precisionBar(actual, worst, barWidth, colors.yellow)}  ${coloredCO2(actual)}`,
  );
  // WORST bar
  console.log(
    `  WORST     ${precisionBar(worst, worst, barWidth, colors.red)}  ${fmtCO2(worst)} ${colors.dim("(all-opus, no cache)")}`,
  );
  // SAVED bar
  console.log(
    `  SAVED     ${precisionBar(saved, worst, barWidth, colors.green)}  ${colors.green(fmtCO2(saved))} ${colors.green(`(${pct}%)`)}`,
  );

  // Breakdown section
  if (report.savings_breakdown.length > 0) {
    console.log(sectionHeader("BREAKDOWN"));
    console.log("");

    const maxSaved = Math.max(...report.savings_breakdown.map((b) => b.saved_grams));
    const labelWidth = 21;
    const breakdownBarWidth = 14;

    for (const item of report.savings_breakdown) {
      const label = item.category.padEnd(labelWidth);
      const bar = precisionBar(item.saved_grams, maxSaved, breakdownBarWidth, colors.green);
      const value = fmtCO2(item.saved_grams);
      console.log(`  ${label}${bar}  ${colors.green(value)} saved`);
    }
  } else {
    console.log("");
    console.log(colors.dim("  No measurable savings detected."));
    console.log(colors.dim("  Try using lighter models (Haiku/Sonnet) for simple tasks."));
  }

  // Cache hit context
  const totalCR = allEntries.reduce((s, e) => s + e.cache_read_tokens, 0);
  const totalInput = allEntries.reduce((s, e) => s + e.input_tokens + e.cache_write_tokens + e.cache_read_tokens, 0);
  const cacheHit = totalInput > 0 ? (totalCR / totalInput) * 100 : 0;

  console.log("");
  console.log(`  Cache hit rate: ${colors.green(cacheHit.toFixed(0) + "%")} ${colors.dim("— higher = more savings")}`);

  // Verdict
  if (pct >= 80) {
    console.log(`  ${colors.green("Excellent efficiency.")} Cache reuse is saving most of your energy.`);
  } else if (pct >= 50) {
    console.log(`  ${colors.yellow("Good efficiency.")} Consider lighter models for simple tasks.`);
  } else if (pct > 0) {
    console.log(`  ${colors.red("Low efficiency.")} High Opus usage with little cache reuse.`);
  }

  // Explanation
  console.log("");
  console.log(colors.dim("  ACTUAL = cache reads at 10% energy + real model"));
  console.log(colors.dim("  WORST  = all Opus + no cache (every token full price)"));
  console.log(colors.dim("  SAVED  = WORST − ACTUAL"));
  console.log("");
}
