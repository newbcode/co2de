import { ClaudeAdapter } from "../adapters/claude/index.js";
import { calculateSavings } from "../engine/savings-tracker.js";
import { loadConfig } from "../core/config.js";
import { formatCO2 } from "../core/tone.js";
import { colors, BAR } from "../renderer/colors.js";

export async function savingsCommand(): Promise<void> {
  const adapter = new ClaudeAdapter();
  const config = loadConfig();
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

  console.log(colors.bold("\n\u{1F30D} Your Carbon Savings — This Week\n"));

  if (report.savings_breakdown.length === 0) {
    console.log(colors.dim("  No measurable savings detected."));
    console.log(colors.dim("  Try using lighter models (Haiku/Sonnet) for simple tasks."));
  } else {
    for (const item of report.savings_breakdown) {
      console.log(colors.bold(`  ${item.category}:`));
      console.log(`    ${item.description}`);
      console.log(colors.green(`    Saved: ${formatCO2(item.saved_grams)} CO2`));
      console.log("");
    }
  }

  // Summary bar
  const total = report.worst_case_co2_grams;
  const actual = report.actual_co2_grams;
  const saved = report.saved_co2_grams;

  if (total > 0) {
    const barWidth = 30;
    const usedRatio = actual / total;
    const savedRatio = saved / total;
    const usedFill = Math.round(usedRatio * barWidth);
    const savedFill = Math.round(savedRatio * barWidth);
    const empty = barWidth - usedFill - savedFill;

    console.log("  " + "\u2500".repeat(40));
    console.log(
      `  Total saved: ${colors.green(formatCO2(saved))} CO2 this week`,
    );
    console.log(
      `  ${colors.yellow(BAR.filled.repeat(usedFill))}${colors.green(BAR.filled.repeat(savedFill))}${colors.dim(BAR.empty.repeat(Math.max(0, empty)))}  vs worst-case`,
    );
    console.log("");
    console.log(
      colors.dim(
        `  Actual: ${formatCO2(actual)} | Worst-case: ${formatCO2(total)} | Saved: ${((saved / total) * 100).toFixed(0)}%`,
      ),
    );
  }
  console.log("");
}
