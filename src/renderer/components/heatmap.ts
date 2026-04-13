import { colors, BAR } from "../colors.js";

interface DayData {
  date: string;
  co2_grams: number;
}

/**
 * Render a GitHub-style contribution heatmap for CO2 emissions.
 */
export function renderHeatmap(
  data: DayData[],
  title = "",
): string {
  if (data.length === 0) return colors.dim("  No data available.");

  // Group by week day
  const dayMap = new Map<string, number>();
  for (const d of data) {
    dayMap.set(d.date, d.co2_grams);
  }

  // Find date range
  const dates = data.map((d) => d.date).sort();
  const startDate = new Date(dates[0]);
  const endDate = new Date(dates[dates.length - 1]);

  // Month/year header
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

  // Build weekly grid
  const dayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const weeks: Map<number, string[]> = new Map();

  // Initialize 7 rows
  for (let d = 0; d < 7; d++) {
    weeks.set(d, []);
  }

  // Fill grid
  const cursor = new Date(startDate);
  // Align to Monday
  while (cursor.getDay() !== 1) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let heaviestDay = "";
  let heaviestValue = 0;

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dayOfWeek = (cursor.getDay() + 6) % 7; // Monday = 0
    const value = dayMap.get(dateStr) ?? -1; // -1 = no data

    if (value > heaviestValue) {
      heaviestValue = value;
      heaviestDay = dateStr;
    }

    const cell = value < 0 ? " " : heatChar(value);
    weeks.get(dayOfWeek)!.push(cell);

    cursor.setDate(cursor.getDate() + 1);
  }

  // Render rows
  for (let d = 0; d < 7; d++) {
    const cells = weeks.get(d)!;
    const label = dayLabels[d];
    const row = cells.join(" ");
    lines.push(`  ${colors.dim(label)}  ${row}`);
  }

  // Legend
  lines.push("");
  lines.push(
    colors.dim(`  ${BAR.empty} <5g  ${BAR.half} 5-20g  ${BAR.dense} 20-50g  ${BAR.filled} 50g+`),
  );

  // Summary
  const totalCO2 = data.reduce((s, d) => s + d.co2_grams, 0);
  const avgCO2 = data.length > 0 ? totalCO2 / data.length : 0;
  lines.push("");
  lines.push(
    `  Total: ${totalCO2.toFixed(1)}g | avg ${avgCO2.toFixed(1)}g/day`,
  );

  if (heaviestDay) {
    lines.push(
      colors.dim(`  Heaviest: ${heaviestDay} (${heaviestValue.toFixed(1)}g)`),
    );
  }

  return lines.join("\n");
}

function heatChar(co2: number): string {
  if (co2 < 5) return colors.green(BAR.empty);
  if (co2 < 20) return colors.yellow(BAR.half);
  if (co2 < 50) return colors.magenta(BAR.dense);
  return colors.red(BAR.filled);
}
