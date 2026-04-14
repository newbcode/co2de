/**
 * Display components: metaphor display, comparison chart.
 * Consolidated from components/metaphor-display.ts, comparison-chart.ts
 */
import type { CodingComparison, MetaphorSet } from "../core/types.js";
import { colors } from "./colors.js";
import { fmtCO2 } from "./format.js";
import { renderComparisonBars } from "./charts.js";

// ─── Metaphor Display ─────────────────────────────────────

export function renderMetaphors(m: MetaphorSet): string {
  const lines: string[] = [];

  if (m.tree_absorption_seconds > 0) {
    const treeTime = formatDuration(m.tree_absorption_seconds);
    lines.push(`  \u{1F333} A tree absorbs this in ${treeTime}`);
  }

  if (m.car_drive_meters > 0) {
    const distance = formatDistance(m.car_drive_meters);
    lines.push(`  \u{1F697} Same as driving a car ${distance}`);
  }

  if (m.google_searches > 0) {
    const searches = m.google_searches.toFixed(1);
    lines.push(`  \u{1F50D} Equivalent to ${searches} Google searches`);
  }

  if (m.phone_charges > 0) {
    const charges = m.phone_charges.toFixed(2);
    lines.push(`  \u{1F4F1} ${charges} smartphone charges`);
  }

  if (m.netflix_streaming_seconds > 60) {
    const time = formatDuration(m.netflix_streaming_seconds);
    lines.push(`  \u{1F4FA} ${time} of Netflix streaming`);
  }

  if (m.led_bulb_hours > 0) {
    const hours = m.led_bulb_hours.toFixed(2);
    lines.push(`  \u{1F4A1} ${hours} hours of an LED bulb`);
  }

  return lines.join("\n");
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

function formatDistance(meters: number): string {
  if (meters < 1) return `${(meters * 100).toFixed(1)}cm`;
  if (meters < 1000) return `${meters.toFixed(0)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// ─── Comparison Chart ─────────────────────────────────────

export function renderComparison(comp: CodingComparison): string {
  const lines: string[] = [];

  const speedup = comp.hand_time_minutes / comp.ai_time_minutes;
  const handHours = comp.hand_time_minutes / 60;

  lines.push(
    colors.bold("\u{1F4A8} AI Coding vs Hand Coding — This Session"),
  );
  lines.push("");
  lines.push(
    `  ~${comp.lines_of_code.toLocaleString()} lines written with AI assistance`,
  );
  lines.push("");

  // ── AI section ──
  lines.push(colors.bold("  AI coding:"));
  const aiGPerLine = comp.lines_of_code > 0
    ? `  ${colors.dim(`(~${(comp.ai_co2_grams / comp.lines_of_code).toFixed(2)}g/line)`)}`
    : "";
  lines.push(
    `    ~${fmtCO2(comp.ai_co2_grams)} CO2${aiGPerLine}`,
  );
  lines.push(
    `    ${comp.ai_tokens.toLocaleString()} tokens over ${comp.ai_time_minutes.toFixed(0)} min ${colors.dim("(wall clock, includes idle)")}`,
  );
  lines.push("");

  // ── Hand section ──
  lines.push(colors.bold("  Hand coding estimate:"));
  const handGPerLine = comp.lines_of_code > 0
    ? `  ${colors.dim(`(~${(comp.hand_co2_grams / comp.lines_of_code).toFixed(3)}g/line)`)}`
    : "";
  lines.push(
    `    ~${fmtCO2(comp.hand_co2_grams)} CO2${handGPerLine}`,
  );
  lines.push(
    `    ~${handHours.toFixed(1)} hours ${colors.dim("(laptop 30W only, typing at 3 lines/min)")}`,
  );
  lines.push("");

  // ── Bar comparison ──
  lines.push(renderComparisonBars(comp.hand_co2_grams, comp.ai_co2_grams));
  lines.push("");

  // ── Summary ──
  if (comp.multiplier > 1) {
    lines.push(
      `  AI: ${colors.red("~" + comp.multiplier.toFixed(0) + "x")} more CO2, ${speedup >= 2 ? colors.green("~" + speedup.toFixed(0) + "x") : colors.dim("~" + speedup.toFixed(1) + "x")} faster`,
    );
  }
  lines.push("");

  // ── Caveats ──
  lines.push(colors.dim("  Caveats:"));
  lines.push(colors.dim("  AI CO2 includes all tokens (conversation, file reads, thinking)"));
  lines.push(colors.dim("  Hand CO2 = laptop only. Real dev includes monitor, IDE, browsing"));
  lines.push(colors.dim("  Hand time = raw typing speed. Real dev is 3-10x slower"));

  return lines.join("\n");
}
