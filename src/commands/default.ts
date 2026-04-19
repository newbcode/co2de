import { countLinesWritten } from "../adapters/claude.js";
import { calculateCarbon, calculateCost } from "../engine/carbon-calculator.js";
import { computePace, computeDelta, formatDelta } from "../engine/pace.js";
import { colors } from "../renderer/colors.js";
import { renderSparkline } from "../renderer/charts.js";
import {
  fmtTokens, approxCO2, fmtCost,
  modelTag, coloredCO2,
  ansiPadEnd, fmtPace, fermiTrio,
} from "../renderer/format.js";
import {
  createContext, getLatestSession, daysAgo,
  aggregateTokenUsage, totalTokenCount,
} from "./shared.js";
import type { SessionSummary } from "../core/types.js";

/**
 * Default command — "quick glance" tracker.
 *
 * Scope policy (aligned with dashboard/readme):
 *   - Default: current project (cwd).
 *   - --all   : aggregate every project.
 *   - Fallback: if cwd has no sessions, automatically use global.
 */
export async function defaultCommand(options: { all?: boolean } = {}): Promise<void> {
  const { config, adapter } = createContext();
  const projectPath = process.cwd();
  const now = new Date();

  // Try per-project first; fall back to global when empty or --all.
  const projectSessions = options.all
    ? []
    : await adapter.getProjectSessions(projectPath);
  const perProject = !options.all && projectSessions.length > 0;

  // Latest session — from project if scoped, else global.
  let latest: SessionSummary | null = null;
  let entries;
  if (perProject) {
    latest = projectSessions[0];
    entries = await adapter.getSessionUsage(latest.id);
  } else {
    const result = await getLatestSession(adapter);
    if (result) { latest = result.session; entries = result.entries; }
  }
  if (!latest || !entries || entries.length === 0) {
    console.log("");
    console.log("  No recent sessions. Start a Claude CLI session first.");
    if (!perProject && !options.all) {
      console.log(colors.dim("  Tip: run inside a project directory, or use  co2de --all  for every project."));
    }
    console.log("");
    return;
  }

  const aggregated = aggregateTokenUsage(entries);
  const sessionResult = calculateCarbon(aggregated, config.region);
  const sessionCost = calculateCost(aggregated);
  const sessionTokens = totalTokenCount(aggregated);

  // Sessions for weekly sparkline + pace + delta — scoped to same policy.
  const scopedRecent: SessionSummary[] = perProject
    ? projectSessions.filter((s) => new Date(s.timestamp).getTime() >= Date.now() - 7 * 86_400_000)
    : await adapter.listSessions(daysAgo(7), now);

  const scopedHistorical: SessionSummary[] = perProject
    ? projectSessions.filter((s) => new Date(s.timestamp).getTime() >= Date.now() - 30 * 86_400_000)
    : await adapter.listSessions(daysAgo(30), now);

  const pace = computePace(scopedRecent);
  const baseline = scopedHistorical.filter((s) => s.id !== latest.id);
  const delta = computeDelta(sessionResult.co2_grams, baseline);

  // Weekly data — 7 days of scoped CO2
  const weekData: number[] = [];
  const dayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const weekDayLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const dow = (date.getDay() + 6) % 7;
    weekDayLabels.push(dayLabels[dow]);
    const dayCO2 = scopedRecent
      .filter((s) => s.timestamp.slice(0, 10) === dateStr)
      .reduce((sum, s) => sum + s.co2_grams, 0);
    weekData.push(dayCO2);
  }

  // Lines written in latest session
  const sessionFilePath = adapter.findSessionFile(latest.id);
  const linesWritten = sessionFilePath ? countLinesWritten(sessionFilePath) : 0;

  // ── Output ─────────────────────────────────────────────
  const scopeLabel = perProject
    ? colors.dim(`project:${basenameOrGlobal(projectPath)}`)
    : colors.dim("scope: all projects");
  console.log("");
  console.log(`  ${colors.bold("co2de")} ${colors.dim("— Carbon Tracker")}  ${scopeLabel}`);
  console.log("");

  // SESSION line
  const sessionModel = ansiPadEnd(modelTag(aggregated.model), 7);
  const gPerLine = linesWritten > 0
    ? `  ${colors.dim(approxCO2(sessionResult.co2_grams / linesWritten) + "/line")}`
    : "";
  const deltaText = formatDelta(delta);
  const deltaSuffix = deltaText ? `  ${colors.dim(deltaText)}` : "";
  console.log(
    `  ${colors.bold("SESSION")}   ${sessionModel}  ${fmtTokens(sessionTokens).padStart(7)} tok   ${ansiPadEnd(coloredCO2(sessionResult.co2_grams), 8)}   ${colors.yellow(fmtCost(sessionCost))}${gPerLine}${deltaSuffix}`,
  );

  // PROJECT line — always shows this-project cumulative (contextual anchor).
  const projectTotals = perProject
    ? projectSessions
    : await adapter.getProjectSessions(projectPath);
  if (projectTotals.length > 0) {
    const projTokens = projectTotals.reduce((s, ps) => s + ps.total_tokens, 0);
    const projCO2 = projectTotals.reduce((s, ps) => s + ps.co2_grams, 0);
    const projCost = projectTotals.reduce((s, ps) => s + ps.cost_usd, 0);
    console.log(
      `  ${colors.bold("PROJECT")}   ${colors.dim(String(projectTotals.length) + " ses")}   ${fmtTokens(projTokens).padStart(7)} tok   ${ansiPadEnd(coloredCO2(projCO2), 8)}   ${colors.yellow(fmtCost(projCost))}`,
    );
  }

  console.log("");

  // WEEK sparkline
  console.log(`  ${colors.bold("WEEK")}  ${colors.dim(weekDayLabels.join(" "))}`);
  console.log(`        ${renderSparkline(weekData, true)}`);

  console.log("");

  // PACE + Fermi trio
  if (pace.weekly_grams > 0) {
    console.log(
      `  ${approxCO2(pace.weekly_grams)} this week  ${colors.dim("·")}  at this rate ${colors.bold(fmtPace(pace.annual_grams))}`,
    );
    const trio = fermiTrio(pace.weekly_grams);
    if (trio) console.log(`  ${colors.dim("≈ " + trio)}`);
  }

  if (!perProject && !options.all) {
    console.log("");
    console.log(colors.dim("  (fallback: no project sessions in cwd — showing global)"));
  }
  console.log("");
}

function basenameOrGlobal(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || p;
}
