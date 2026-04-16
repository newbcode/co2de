import { calculateCarbon } from "../engine/carbon-calculator.js";
import { computeDelta, formatDelta } from "../engine/pace.js";
import { colors, colorForLevel } from "../renderer/colors.js";
import { getEmissionLevel } from "../core/tone.js";
import { renderSparkline } from "../renderer/charts.js";
import {
  approxCO2, coloredCO2, shortModel, sectionHeader,
  fmtDate, ansiPadEnd,
} from "../renderer/format.js";
import { createContext, getLatestSession, daysAgo } from "./shared.js";
import type { TokenUsage } from "../core/types.js";

/**
 * co2de trace — per-turn emission timeline for a session.
 *
 * Closes the abstraction gap: "4.65kg / 13.5M tokens" becomes "turn 7 was
 * 39% of the session" — visible cause, visible consequence. The CLI
 * counterpart to the dashboard's Session Replay view.
 *
 * No celebration, no finger-wagging — just the turns ranked by emission.
 */
export async function traceCommand(sessionId?: string): Promise<void> {
  const { config, adapter } = createContext();

  let entries: TokenUsage[];
  let label: string;

  if (sessionId) {
    entries = await adapter.getSessionUsage(sessionId);
    if (entries.length === 0) {
      console.log(colors.dim(`  No data for session ${sessionId}.`));
      return;
    }
    label = sessionId.slice(0, 8);
  } else {
    const result = await getLatestSession(adapter);
    if (!result) {
      console.log("  No recent sessions. Start a Claude CLI session first.");
      return;
    }
    entries = result.entries;
    label = "latest";
  }

  // Filter out zero-token turns (empty messages)
  const turns = entries.filter(
    (e) =>
      e.input_tokens + e.output_tokens + e.cache_read_tokens + e.cache_write_tokens > 0,
  );
  if (turns.length === 0) {
    console.log(colors.dim("  Session has no billable turns."));
    return;
  }

  // Compute CO2 per turn
  const turnCO2 = turns.map((t) => calculateCarbon(t, config.region).co2_grams);
  const totalCO2 = turnCO2.reduce((s, v) => s + v, 0);
  const firstTs = turns[0].timestamp;
  const lastTs = turns[turns.length - 1].timestamp;
  const model = shortModel(turns[turns.length - 1].model);

  // Header
  console.log("");
  console.log(sectionHeader(
    "CARBON TRACE",
    `${fmtDate(firstTs)} · ${model} · ${approxCO2(totalCO2)} · ${turns.length} turns · session ${label}`,
  ));
  console.log("");

  // Sparkline
  console.log(`  ${colors.dim("per-turn emission")}`);
  console.log(`  ${renderSparkline(turnCO2)}`);

  // Time axis — first · middle · last
  const timeOf = (iso: string) => iso.slice(11, 16);
  const axisLabel = turns.length >= 3
    ? `  ${colors.dim(timeOf(firstTs))}${" ".repeat(Math.max(2, turns.length - 10))}${colors.dim(timeOf(lastTs))}`
    : `  ${colors.dim(timeOf(firstTs))} → ${colors.dim(timeOf(lastTs))}`;
  console.log(axisLabel);
  console.log("");

  // Hot turns — top N by CO2
  const indexed = turnCO2.map((g, i) => ({ idx: i, g, ts: turns[i].timestamp, model: turns[i].model }));
  const hotN = Math.min(5, Math.max(3, Math.floor(turns.length / 10)));
  const hot = [...indexed].sort((a, b) => b.g - a.g).slice(0, hotN);

  console.log(colors.bold("  HOT TURNS"));
  console.log("");
  for (const h of hot) {
    const pct = totalCO2 > 0 ? Math.round((h.g / totalCO2) * 100) : 0;
    const pctText = pct >= 10 ? `${pct}% of session` : "";
    const turnNum = `#${String(h.idx + 1).padStart(3, " ")}`;
    const color = colorForLevel(getEmissionLevel(h.g));
    const co2Col = ansiPadEnd(color("~" + fmtG(h.g)), 10);
    console.log(
      `  ${colors.dim(turnNum)}  ${colors.dim(timeOf(h.ts))}  ${ansiPadEnd(shortModel(h.model), 7)}  ${co2Col}  ${colors.dim(pctText)}`,
    );
  }
  console.log("");

  // Summary
  const sorted = [...turnCO2].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const peak = Math.max(...turnCO2);
  const avg = totalCO2 / turns.length;
  const ratio = median > 0 ? peak / median : 0;

  // Session-level delta vs other sessions
  const now = new Date();
  const history = await adapter.listSessions(daysAgo(30), now);
  const baseline = history.filter((s) => s.id !== turns[0].session_id);
  const delta = computeDelta(totalCO2, baseline);
  const deltaText = formatDelta(delta);

  console.log(
    `  ${turns.length} turns  ·  avg ${colors.bold(approxCO2(avg))}  ·  peak/median ratio ${ratio.toFixed(1)}×`
    + (deltaText ? `  ·  ${colors.dim(deltaText)}` : ""),
  );
  console.log(`  Total: ${coloredCO2(totalCO2)}`);
  console.log("");
}

function fmtG(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)}kg`;
  if (grams >= 10) return `${Math.round(grams)}g`;
  return `${grams.toFixed(1)}g`;
}
