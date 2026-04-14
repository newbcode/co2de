/**
 * Chart primitives: bar charts, sparklines, dashboards, heatmaps.
 * Consolidated from components/bar-chart.ts, sparkline.ts, dashboard.ts, heatmap.ts
 */
import { colors, BAR, colorForLevel } from "./colors.js";
import { getEmissionLevel } from "../core/tone.js";
import { fmtCO2 } from "./format.js";

// ─── Bar Chart ────────────────────────────────────────────

export function renderBar(
  value: number,
  max: number,
  width = 20,
  label = "",
): string {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const level = getEmissionLevel(value);
  const color = colorForLevel(level);

  const bar = color(BAR.filled.repeat(filled)) + colors.dim(BAR.empty.repeat(empty));
  return label ? `${bar}  ${label}` : bar;
}

export function renderBarChart(
  items: Array<{ label: string; value: number; suffix?: string }>,
  width = 20,
): string {
  if (items.length === 0) return "";

  const max = Math.max(...items.map((i) => i.value));
  const maxLabelLen = Math.max(...items.map((i) => i.label.length));

  return items
    .map((item) => {
      const paddedLabel = item.label.padEnd(maxLabelLen);
      const bar = renderBar(item.value, max, width);
      const suffix = item.suffix ?? "";
      return `  ${colors.dim(paddedLabel)}  ${bar}  ${suffix}`;
    })
    .join("\n");
}

export function renderComparisonBars(
  handCO2: number,
  aiCO2: number,
  width = 30,
): string {
  const max = Math.max(handCO2, aiCO2);

  const handFilled = max > 0 ? Math.round((handCO2 / max) * width) : 0;
  const aiFilled = max > 0 ? Math.round((aiCO2 / max) * width) : 0;

  const handBar =
    colors.green(BAR.filled.repeat(Math.max(handFilled, 1))) +
    colors.dim(BAR.empty.repeat(width - Math.max(handFilled, 1)));
  const aiBar =
    colors.red(BAR.filled.repeat(aiFilled)) +
    colors.dim(BAR.empty.repeat(width - aiFilled));

  return [
    `  Hand  ${handBar}  ${handCO2.toFixed(3)}g`,
    `  AI    ${aiBar}  ${aiCO2.toFixed(2)}g`,
  ].join("\n");
}

// ─── Sparkline ────────────────────────────────────────────

const BLOCKS = [" ", "\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];

export function renderSparkline(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 0.001);

  return values
    .map((v) => {
      if (v <= 0) return "\u00B7";
      const idx = Math.min(Math.round((v / max) * 8), 8);
      const char = BLOCKS[idx];
      const level = getEmissionLevel(v);
      return colorForLevel(level)(char);
    })
    .join("");
}

// ─── Dashboard ────────────────────────────────────────────

interface DayEntry {
  label: string;
  co2_grams: number;
  sessions: number;
}

export function renderDashboard(
  days: DayEntry[],
  todayLabel = "",
): string {
  if (days.length === 0) return colors.dim("  No data for the past 7 days.");

  const lines: string[] = [];
  lines.push(colors.bold("\u{1F4A8} 7-Day Carbon Dashboard"));
  lines.push("");

  const max = Math.max(...days.map((d) => d.co2_grams), 1);
  const barWidth = 20;

  for (const day of days) {
    const filled = Math.round((day.co2_grams / max) * barWidth);
    const empty = barWidth - filled;
    const level = getEmissionLevel(day.co2_grams);
    const color = colorForLevel(level);

    const bar =
      color(BAR.filled.repeat(filled)) +
      colors.dim(BAR.empty.repeat(empty));

    const co2Str =
      day.co2_grams > 0 ? `${day.co2_grams.toFixed(1)}g` : "-";
    const marker = day.label === todayLabel ? colors.dim(" \u2190 today") : "";

    lines.push(
      `  ${colors.dim(day.label)}  ${bar}  ${co2Str}${marker}`,
    );
  }

  const total = days.reduce((s, d) => s + d.co2_grams, 0);
  const totalSessions = days.reduce((s, d) => s + d.sessions, 0);
  lines.push("");
  lines.push(
    `  Total: ${total.toFixed(1)}g across ${totalSessions} sessions`,
  );

  return lines.join("\n");
}

// ─── Heatmap ──────────────────────────────────────────────

interface DayData {
  date: string;
  co2_grams: number;
}

export function renderHeatmap(
  data: DayData[],
  title = "",
): string {
  if (data.length === 0) return colors.dim("  No data available.");

  const dayMap = new Map<string, number>();
  for (const d of data) {
    dayMap.set(d.date, d.co2_grams);
  }

  const dates = data.map((d) => d.date).sort();
  const startDate = new Date(dates[0]);
  const endDate = new Date(dates[dates.length - 1]);

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const headerMonth = monthNames[endDate.getMonth()];
  const headerYear = endDate.getFullYear();

  const lines: string[] = [];

  if (title) {
    lines.push(colors.bold(title));
    lines.push("");
  }

  lines.push(`  ${headerMonth} ${headerYear}`);

  const dayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const weeks: Map<number, string[]> = new Map();

  for (let d = 0; d < 7; d++) {
    weeks.set(d, []);
  }

  const cursor = new Date(startDate);
  while (cursor.getDay() !== 1) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let heaviestDay = "";
  let heaviestValue = 0;

  // Collect all values for relative scaling
  const allValues = data.map((d) => d.co2_grams).filter((v) => v > 0);
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dayOfWeek = (cursor.getDay() + 6) % 7;
    const value = dayMap.get(dateStr) ?? -1;

    if (value > heaviestValue) {
      heaviestValue = value;
      heaviestDay = dateStr;
    }

    const cell = value < 0 ? " " : heatCharRelative(value, maxValue);
    weeks.get(dayOfWeek)!.push(cell);

    cursor.setDate(cursor.getDate() + 1);
  }

  for (let d = 0; d < 7; d++) {
    const cells = weeks.get(d)!;
    const label = dayLabels[d];
    const row = cells.join(" ");
    lines.push(`  ${colors.dim(label)}  ${row}`);
  }

  // Legend with relative thresholds
  const q1 = fmtCO2(maxValue * 0.25);
  const q2 = fmtCO2(maxValue * 0.5);
  const q3 = fmtCO2(maxValue * 0.75);
  lines.push("");
  lines.push(
    colors.dim(`  ${BAR.empty} <${q1}  ${BAR.half} <${q2}  ${BAR.dense} <${q3}  ${BAR.filled} ${q3}+`),
  );

  const totalCO2 = data.reduce((s, d) => s + d.co2_grams, 0);
  const avgCO2 = data.length > 0 ? totalCO2 / data.length : 0;
  lines.push("");
  lines.push(
    `  Total: ~${fmtCO2(totalCO2)} | avg ~${fmtCO2(avgCO2)}/day`,
  );

  if (heaviestDay) {
    lines.push(
      colors.dim(`  Heaviest: ${heaviestDay} (~${fmtCO2(heaviestValue)})`),
    );
  }

  return lines.join("\n");
}

/** Relative heat character: scales to the max value in the dataset */
function heatCharRelative(co2: number, max: number): string {
  const ratio = max > 0 ? co2 / max : 0;
  if (ratio < 0.25) return colors.green(BAR.empty);
  if (ratio < 0.5) return colors.yellow(BAR.half);
  if (ratio < 0.75) return colors.yellow(BAR.dense);
  return colors.red(BAR.filled);
}
