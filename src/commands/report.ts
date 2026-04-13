import { ClaudeAdapter } from "../adapters/claude/index.js";
import { calculateCarbon } from "../engine/carbon-calculator.js";
import { loadConfig } from "../core/config.js";
import { renderSession } from "../renderer/terminal.js";
import { renderMetaphors } from "../renderer/components/metaphor-display.js";
import { renderBarChart } from "../renderer/components/bar-chart.js";
import { formatCO2, getToneMessage } from "../core/tone.js";
import { colors } from "../renderer/colors.js";
import type { TokenUsage } from "../core/types.js";

export async function reportCommand(options: {
  today?: boolean;
  week?: boolean;
}): Promise<void> {
  const adapter = new ClaudeAdapter();
  const config = loadConfig();
  const now = new Date();

  let from: Date;
  let periodLabel: string;

  if (options.week) {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
    periodLabel = "Past 7 days";
  } else {
    // Default: today
    from = new Date(now.toISOString().slice(0, 10));
    periodLabel = "Today";
  }

  const sessions = await adapter.listSessions(from, now);

  if (sessions.length === 0) {
    console.log(colors.dim(`  No sessions found for ${periodLabel.toLowerCase()}.`));
    return;
  }

  // Aggregate
  let totalTokens = 0;
  let totalCO2 = 0;

  for (const s of sessions) {
    totalTokens += s.total_tokens;
    totalCO2 += s.co2_grams;
  }

  const tone = getToneMessage(totalCO2);

  console.log(colors.bold(`\n${tone.statusline_icon} co2de — ${periodLabel} Report`));
  console.log("");
  console.log(`  Sessions: ${sessions.length}`);
  console.log(`  Tokens:   ${totalTokens.toLocaleString()}`);
  console.log(`  CO2:      ${formatCO2(totalCO2)} (estimated)`);
  console.log("");

  // Scale comparisons
  console.log(colors.bold("  Scale Comparison:"));
  console.log("");

  const items = [
    { label: "This period", value: totalCO2, suffix: formatCO2(totalCO2) },
    { label: "Google search", value: 0.2, suffix: "0.2g" },
    { label: "Boil a kettle", value: 15, suffix: "15g" },
    { label: "Drive 1 km", value: 120, suffix: "120g" },
  ];

  console.log(renderBarChart(items, 25));
  console.log("");

  // Per-session breakdown
  if (sessions.length > 1) {
    console.log(colors.bold("  Sessions:"));
    for (const s of sessions.slice(0, 10)) {
      const shortId = s.id.slice(0, 7);
      const co2 = formatCO2(s.co2_grams);
      console.log(
        `    ${colors.dim(shortId)}  ${colors.magenta(s.model.slice(0, 10).padEnd(10))}  ${s.total_tokens.toLocaleString().padStart(10)} tok  ${co2.padStart(7)}`,
      );
    }
    if (sessions.length > 10) {
      console.log(colors.dim(`    ... and ${sessions.length - 10} more`));
    }
  }

  console.log("");
}
