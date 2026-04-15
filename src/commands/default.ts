import { countLinesWritten } from "../adapters/claude.js";
import { calculateCarbon, calculateCost } from "../engine/carbon-calculator.js";
import { calculateSavings } from "../engine/savings-tracker.js";
import { colors, colorForLevel } from "../renderer/colors.js";
import { getEmissionLevel } from "../core/tone.js";
import { renderSparkline } from "../renderer/charts.js";
import {
  fmtTokens, fmtCO2, fmtCost,
  modelTag, coloredCO2,
  precisionBar,
  ansiPadEnd,
} from "../renderer/format.js";
import {
  createContext, getLatestSession, daysAgo,
  aggregateTokenUsage, totalTokenCount, collectAllEntries,
} from "./shared.js";

export async function defaultCommand(): Promise<void> {
  const { config, adapter } = createContext();

  const result = await getLatestSession(adapter);
  if (!result) {
    console.log("  No recent sessions. Start a Claude CLI session first.");
    return;
  }

  const { session: latest, entries } = result;
  const aggregated = aggregateTokenUsage(entries);

  const sessionResult = calculateCarbon(aggregated, config.region);
  const sessionCost = calculateCost(aggregated);
  const sessionTokens = totalTokenCount(aggregated);

  // Project totals
  const projectSessions = await adapter.getProjectSessions(process.cwd());

  // Savings — gather all token entries from recent sessions
  let savingsData: { actual: number; worstCase: number; savedPct: number } | null = null;
  const now = new Date();
  const recentSessions = await adapter.listSessions(daysAgo(7), now);
  if (recentSessions.length > 0) {
    const allEntries = await collectAllEntries(adapter, recentSessions);
    if (allEntries.length > 0) {
      const report = calculateSavings(allEntries, config.region);
      const pct = report.worst_case_co2_grams > 0
        ? Math.round((report.saved_co2_grams / report.worst_case_co2_grams) * 100)
        : 0;
      savingsData = {
        actual: report.actual_co2_grams,
        worstCase: report.worst_case_co2_grams,
        savedPct: pct,
      };
    }
  }

  // Week data — 7 daily CO2 values
  const weekData: number[] = [];
  const dayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  // Build labels starting from 6 days ago
  const weekDayLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const dow = (date.getDay() + 6) % 7; // Mon=0
    weekDayLabels.push(dayLabels[dow]);
    const dayCO2 = recentSessions
      .filter((s) => s.timestamp.slice(0, 10) === dateStr)
      .reduce((sum, s) => sum + s.co2_grams, 0);
    weekData.push(dayCO2);
  }

  // Count lines written in this session
  const sessionFilePath = adapter.findSessionFile(latest.id);
  const linesWritten = sessionFilePath ? countLinesWritten(sessionFilePath) : 0;

  // ── Output ──
  console.log("");
  console.log(`  ${colors.bold("co2de")} ${colors.dim("— Carbon Tracker")}`);
  console.log("");

  // SESSION line
  const sessionModel = ansiPadEnd(modelTag(aggregated.model), 7);
  const gPerLine = linesWritten > 0
    ? `   ${colors.dim(fmtCO2(sessionResult.co2_grams / linesWritten) + "/line written")}`
    : "";
  console.log(
    `  ${colors.bold("SESSION")}   ${sessionModel}  ${fmtTokens(sessionTokens).padStart(7)} tok   ${ansiPadEnd(coloredCO2(sessionResult.co2_grams), 8)}   ${colors.yellow(fmtCost(sessionCost))}${gPerLine}`,
  );

  // PROJECT line
  if (projectSessions.length > 0) {
    const projTokens = projectSessions.reduce((s, ps) => s + ps.total_tokens, 0);
    const projCO2 = projectSessions.reduce((s, ps) => s + ps.co2_grams, 0);
    const projCost = projectSessions.reduce((s, ps) => s + ps.cost_usd, 0);

    console.log(
      `  ${colors.bold("PROJECT")}   ${colors.dim(String(projectSessions.length) + " ses")}   ${fmtTokens(projTokens).padStart(7)} tok   ${ansiPadEnd(coloredCO2(projCO2), 8)}   ${colors.yellow(fmtCost(projCost))}`,
    );
  }

  console.log("");

  // WEEK sparkline
  console.log(`  ${colors.bold("WEEK")}  ${colors.dim(weekDayLabels.join(" "))}`);
  console.log(`        ${renderSparkline(weekData, true)}`);

  // Total this week
  const weekTotal = weekData.reduce((s, v) => s + v, 0);
  const weekSessions = recentSessions.length;
  console.log("");
  console.log(colors.dim(`  Total this week: ${fmtCO2(weekTotal)} across ${weekSessions} sessions`));

  // SAVED line (if savings data exists)
  if (savingsData && savingsData.worstCase > 0 && savingsData.savedPct > 0) {
    const barWidth = 10;
    const ratio = Math.min(savingsData.actual / savingsData.worstCase, 1);
    const level = getEmissionLevel(savingsData.actual);
    const co2Color = colorForLevel(level);
    const bar = precisionBar(ratio, 1, barWidth, co2Color);
    console.log(
      `  ${colors.bold("SAVED")}  ${bar}  ${colors.green(savingsData.savedPct + "%")} vs worst-case`,
    );
  }

  console.log("");
}
