import type { CarbonResult } from "../../core/types.js";
import { formatCO2, getToneMessage } from "../../core/tone.js";
import { colors } from "../colors.js";

/**
 * Compact single-line output for narrow terminals (<80 columns).
 */
export function renderCompact(result: CarbonResult): string {
  const tone = getToneMessage(result.co2_grams);
  const totalTokens =
    result.usage.input_tokens + result.usage.output_tokens;
  const co2 = formatCO2(result.co2_grams);
  const searches = (result.co2_grams / 0.2).toFixed(0);

  return `${tone.statusline_icon} ${co2} CO2 | ${totalTokens.toLocaleString()} tok | ~${searches} Google searches`;
}

/**
 * Compact session log line.
 */
export function renderCompactLogLine(
  id: string,
  timeAgo: string,
  model: string,
  tokens: number,
  co2Grams: number,
): string {
  const co2 = formatCO2(co2Grams);
  const shortId = id.slice(0, 7);
  return `  ${colors.dim(shortId)}  ${timeAgo.padEnd(12)}  ${colors.magenta(model.padEnd(8))}  ${tokens.toLocaleString().padStart(10)} tok  ${co2.padStart(7)}`;
}
