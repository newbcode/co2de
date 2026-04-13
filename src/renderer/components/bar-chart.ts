import { colors, BAR, colorForLevel } from "../colors.js";
import { getEmissionLevel } from "../../core/tone.js";

/**
 * Render a horizontal bar chart line.
 *
 * @param value - Current value
 * @param max - Maximum value (determines bar length)
 * @param width - Total bar width in characters (default 20)
 * @param label - Optional label after the bar
 */
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

/**
 * Render a labeled bar chart with multiple rows.
 */
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

/**
 * Render a comparison bar (hand vs AI coding).
 */
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
