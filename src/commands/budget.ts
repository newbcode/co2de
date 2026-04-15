import { updateConfig } from "../core/config.js";
import { colors } from "../renderer/colors.js";
import { fmtCO2, precisionBar, sectionHeader, coloredCO2 } from "../renderer/format.js";
import { createContext, todayStart, parseGrams } from "./shared.js";

export async function budgetCommand(options: {
  set?: string;
}): Promise<void> {
  if (options.set) {
    const grams = parseGrams(options.set);
    if (grams === null || grams <= 0) {
      console.log(colors.red("  Invalid budget. Use: co2de budget --set 50 or --set 1.5kg"));
      return;
    }
    updateConfig({ daily_budget_grams: grams });
    console.log(`  Daily budget set to ${fmtCO2(grams)} CO\u2082.`);
    return;
  }

  const { config, adapter } = createContext();
  const now = new Date();
  const sessions = await adapter.listSessions(todayStart(), now);
  const budget = config.daily_budget_grams;
  const totalUsed = sessions.reduce((s, ses) => s + ses.co2_grams, 0);

  // ── No budget set ──────────────────────────────────────
  if (!budget) {
    console.log(sectionHeader("DAILY CARBON BUDGET"));
    console.log(`  No budget set. Use ${colors.bold("`co2de budget --set 50`")} to set a daily limit.`);
    console.log("");
    if (sessions.length > 0) {
      console.log(`  Today's usage: ${coloredCO2(totalUsed)} across ${sessions.length} sessions`);
    }
    console.log("");
    return;
  }

  // ── Header ─────────────────────────────────────────────
  console.log(sectionHeader("DAILY CARBON BUDGET"));
  console.log(`  Budget: ${fmtCO2(budget)}/day`);
  console.log("");

  // ── Main progress bar ──────────────────────────────────
  const pct = Math.min((totalUsed / budget) * 100, 100);
  const overBudget = totalUsed > budget;
  const barColor = overBudget ? colors.red : pct >= 80 ? colors.yellow : colors.green;
  const barWidth = 20;
  const bar = precisionBar(totalUsed, budget, barWidth, barColor);
  const pctStr = overBudget
    ? colors.red(`${((totalUsed / budget) * 100).toFixed(0)}%`)
    : `${pct.toFixed(0)}%`;

  if (sessions.length === 0) {
    console.log(`  TODAY   ${colors.dim(("░".repeat(barWidth)))} ${colors.dim("no sessions")} / ${fmtCO2(budget)}`);
    console.log("");
    console.log(`  Status: ${colors.green("On track")} — ${fmtCO2(budget)} remaining`);
    console.log("");
    return;
  }

  console.log(
    `  TODAY   ${bar} ${coloredCO2(totalUsed)} / ${fmtCO2(budget)} (${pctStr})`,
  );

  // ── Time-of-day breakdown ──────────────────────────────
  if (sessions.length > 0) {
    const periods = [
      { label: "Morning  ", filter: (h: number) => h < 12 },
      { label: "Afternoon", filter: (h: number) => h >= 12 && h < 18 },
      { label: "Evening  ", filter: (h: number) => h >= 18 },
    ] as const;

    const breakdown = periods.map((p) => {
      const matching = sessions.filter((s) => p.filter(new Date(s.timestamp).getHours()));
      const co2 = matching.reduce((sum, s) => sum + s.co2_grams, 0);
      return { label: p.label, co2, count: matching.length };
    });

    const maxCO2 = Math.max(...breakdown.map((b) => b.co2), 1);

    console.log(sectionHeader("BREAKDOWN BY TIME"));
    const periodBarWidth = 12;
    for (const b of breakdown) {
      const periodColor = b.co2 > budget * 0.5 ? colors.red : b.co2 > budget * 0.2 ? colors.yellow : colors.green;
      const pBar = precisionBar(b.co2, maxCO2, periodBarWidth, periodColor);
      const co2Str = coloredCO2(b.co2).padStart(8);
      console.log(
        `  ${b.label}  ${pBar}  ${co2Str}   ${colors.dim(`${b.count} ses`)}`,
      );
    }
  }

  // ── Status line ────────────────────────────────────────
  console.log("");
  if (overBudget) {
    const over = totalUsed - budget;
    console.log(
      `  Status: ${colors.red("Over budget")} — ${colors.red(fmtCO2(over))} over limit`,
    );
  } else {
    const remaining = budget - totalUsed;
    console.log(
      `  Status: ${colors.green("On track")} — ${fmtCO2(remaining)} remaining`,
    );
  }
  console.log("");
}
