import { colors, colorForLevel } from "../renderer/colors.js";
import { getEmissionLevel } from "../core/tone.js";
import {
  fmtTokens, approxCO2, fmtCost,
  modelTag, coloredCO2, fmtTimeAgo,
  precisionBar, ansiPadEnd,
} from "../renderer/format.js";
import { createContext, daysAgo } from "./shared.js";

export async function logCommand(): Promise<void> {
  const { adapter } = createContext();
  const now = new Date();

  const sessions = await adapter.listSessions(daysAgo(7), now);

  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions in the past 7 days."));
    return;
  }

  const maxCO2 = Math.max(...sessions.map((s) => s.co2_grams), 1);
  const barW = 12;

  console.log("");
  console.log(colors.bold("  SESSION LOG") + colors.dim(" — Past 7 Days"));
  console.log("");

  // Table header
  const hdrNum = "#".padStart(3);
  const hdrTime = "TIME".padEnd(12);
  const hdrModel = "MODEL".padEnd(7);
  const hdrTok = "TOKENS".padStart(8);
  const hdrCost = "COST".padStart(8);
  const hdrCO2 = "CO\u2082".padStart(8);
  console.log(
    `  ${colors.dim(hdrNum)}  ${colors.dim(hdrTime)}  ${colors.dim(hdrModel)}  ${colors.dim(hdrTok)}  ${colors.dim(hdrCost)}  ${colors.dim(hdrCO2)}  ${colors.dim("".padEnd(barW))}`,
  );
  console.log(
    colors.dim(`  ${"─".repeat(3)}  ${"─".repeat(12)}  ${"─".repeat(7)}  ${"─".repeat(8)}  ${"─".repeat(8)}  ${"─".repeat(8)}  ${"─".repeat(barW)}`),
  );

  // Session rows
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const num = String(i + 1).padStart(3);
    const timeAgo = fmtTimeAgo(new Date(s.timestamp)).padEnd(12);
    const model = ansiPadEnd(modelTag(s.model), 7);
    const tokens = fmtTokens(s.total_tokens).padStart(8);
    const cost = colors.dim(fmtCost(s.cost_usd).padStart(8));
    const co2 = coloredCO2(s.co2_grams);
    const co2Raw = approxCO2(s.co2_grams);
    const co2Padded = " ".repeat(Math.max(0, 8 - co2Raw.length)) + co2;

    const level = getEmissionLevel(s.co2_grams);
    const co2Color = colorForLevel(level);
    const bar = precisionBar(s.co2_grams, maxCO2, barW, co2Color);

    console.log(
      `  ${colors.dim(num)}  ${timeAgo}  ${model}  ${tokens}  ${cost}  ${co2Padded}  ${bar}`,
    );
  }

  // Summary
  const totalCO2 = sessions.reduce((s, ses) => s + ses.co2_grams, 0);
  const totalCost = sessions.reduce((s, ses) => s + ses.cost_usd, 0);
  console.log("");
  console.log(
    `  This week: ${coloredCO2(totalCO2)} across ${sessions.length} sessions (${colors.dim(fmtCost(totalCost))})`,
  );
  console.log("");
}
