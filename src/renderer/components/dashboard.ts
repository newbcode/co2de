import { colors, BAR } from "../colors.js";
import { getEmissionLevel } from "../../core/tone.js";
import { colorForLevel } from "../colors.js";

interface DayEntry {
  label: string;
  co2_grams: number;
  sessions: number;
}

/**
 * Render a 7-day cumulative dashboard.
 */
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
    const marker = day.label === todayLabel ? colors.cyan(" \u2190 today") : "";

    lines.push(
      `  ${colors.dim(day.label)}  ${bar}  ${co2Str}${marker}`,
    );
  }

  // Totals
  const total = days.reduce((s, d) => s + d.co2_grams, 0);
  const totalSessions = days.reduce((s, d) => s + d.sessions, 0);
  lines.push("");
  lines.push(
    `  Total: ${total.toFixed(1)}g across ${totalSessions} sessions`,
  );

  return lines.join("\n");
}
