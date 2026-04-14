import { ClaudeAdapter } from "../adapters/claude.js";
import { loadConfig } from "../core/config.js";
import { colors } from "../renderer/colors.js";
import { getEmissionLevel } from "../core/tone.js";
import { colorForLevel } from "../renderer/colors.js";
import {
  fmtTokens, fmtCO2, fmtCost, fmtDate,
  precisionBar, coloredCO2,
} from "../renderer/format.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function weeklyCommand(): Promise<void> {
  const config = loadConfig();
  const adapter = new ClaudeAdapter(config.region);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const sessions = await adapter.listSessions(weekAgo, now);

  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions in the past 7 days."));
    return;
  }

  // Group by day
  const dayMap = new Map<string, { co2: number; tokens: number; cost: number; sessions: number }>();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { co2: 0, tokens: 0, cost: 0, sessions: 0 });
  }

  for (const s of sessions) {
    const key = s.timestamp.slice(0, 10);
    const entry = dayMap.get(key);
    if (entry) {
      entry.co2 += s.co2_grams;
      entry.tokens += s.total_tokens;
      entry.cost += s.cost_usd;
      entry.sessions++;
    }
  }

  const totalCO2 = sessions.reduce((s, x) => s + x.co2_grams, 0);
  const totalTokens = sessions.reduce((s, x) => s + x.total_tokens, 0);
  const totalCost = sessions.reduce((s, x) => s + x.cost_usd, 0);
  const totalSessions = sessions.length;
  const maxCO2 = Math.max(...Array.from(dayMap.values()).map((d) => d.co2), 1);

  // Header
  console.log("");
  console.log(colors.bold("  WEEKLY CARBON REPORT"));
  console.log(colors.dim(`  ${fmtDate(weekAgo.toISOString())} \u2192 ${fmtDate(now.toISOString())}`));
  console.log("");

  // Table header
  const barW = 16;
  const hdrDate = "DATE".padEnd(10);
  const hdrSes = "SESSIONS".padStart(8);
  const hdrTok = "TOKENS".padStart(8);
  const hdrCO2 = "CO2".padStart(8);
  const hdrCost = "COST".padStart(8);
  console.log(
    `  ${colors.dim(hdrDate)}  ${colors.dim(hdrSes)}   ${colors.dim(hdrTok)}   ${colors.dim(hdrCO2)}  ${colors.dim(hdrCost)}`,
  );
  const hr = `  ${"─".repeat(10)}  ${"─".repeat(8)}   ${"─".repeat(8)}   ${"─".repeat(8)}  ${"─".repeat(8)}  ${"─".repeat(barW)}`;
  console.log(colors.dim(hr));

  // Daily rows
  let peakDay = "";
  let peakCO2 = 0;
  let activeDays = 0;

  for (const [date, data] of dayMap) {
    const d = new Date(date);
    const dayName = DAY_NAMES[d.getDay()];
    const dateLabel = `${dayName} ${fmtDate(date)}`;

    if (data.co2 > peakCO2) {
      peakCO2 = data.co2;
      peakDay = dayName;
    }
    if (data.sessions > 0) activeDays++;

    if (data.sessions === 0) {
      console.log(
        `  ${colors.dim(dateLabel.padEnd(10))}  ${colors.dim("-".padStart(8))}   ${colors.dim("-".padStart(8))}   ${colors.dim("-".padStart(8))}  ${colors.dim("-".padStart(8))}`,
      );
    } else {
      const level = getEmissionLevel(data.co2);
      const co2Color = colorForLevel(level);
      const bar = precisionBar(data.co2, maxCO2, barW, co2Color);

      console.log(
        `  ${dateLabel.padEnd(10)}  ${String(data.sessions).padStart(8)}   ${fmtTokens(data.tokens).padStart(8)}   ${coloredCO2(data.co2).padStart(8 + (coloredCO2(data.co2).length - fmtCO2(data.co2).length))}  ${colors.yellow(fmtCost(data.cost).padStart(8))}  ${bar}`,
      );
    }
  }

  // Footer separator
  console.log(colors.dim(hr));

  // Total row
  const totalLevel = getEmissionLevel(totalCO2);
  const totalCo2Color = colorForLevel(totalLevel);
  const co2Str = totalCo2Color(fmtCO2(totalCO2));
  const co2Raw = fmtCO2(totalCO2);
  console.log(
    `  ${colors.bold("TOTAL".padEnd(10))}  ${colors.bold(String(totalSessions).padStart(8))}   ${colors.bold(fmtTokens(totalTokens).padStart(8))}   ${colors.bold(co2Str)}${" ".repeat(Math.max(0, 8 - co2Raw.length))}  ${colors.bold(colors.yellow(fmtCost(totalCost).padStart(8)))}`,
  );

  // Summary line
  const avgCO2 = activeDays > 0 ? totalCO2 / activeDays : 0;
  console.log("");
  console.log(
    `  ${colors.dim("Avg:")} ${fmtCO2(avgCO2)}/day ${colors.dim("\u00B7")} ${colors.dim("Peak:")} ${peakDay} (${fmtCO2(peakCO2)})`,
  );
  console.log("");
}
