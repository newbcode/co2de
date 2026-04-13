import type { CarbonResult } from "../../core/types.js";
import { colors, BOX } from "../colors.js";
import { getToneMessage, formatCO2 } from "../../core/tone.js";
import { renderMetaphors } from "./metaphor-display.js";
import { renderBar } from "./bar-chart.js";

/**
 * Render the session summary banner shown by `co2de` (default command).
 */
export function renderSessionBanner(
  result: CarbonResult,
  termWidth = 50,
): string {
  const tone = getToneMessage(result.co2_grams);
  const totalTokens =
    result.usage.input_tokens +
    result.usage.output_tokens +
    result.usage.cache_read_tokens +
    result.usage.cache_write_tokens;

  const innerWidth = Math.min(termWidth - 4, 50);
  const hr = BOX.horizontal.repeat(innerWidth + 2);

  const lines: string[] = [];

  // Top border
  lines.push(colors.dim(`${BOX.topLeft}${hr}${BOX.topRight}`));

  // Title
  const title = `${tone.statusline_icon} co2de — Session Carbon Footprint`;
  lines.push(colors.dim(BOX.vertical) + `  ${colors.bold(title)}`.padEnd(innerWidth + 2) + colors.dim(BOX.vertical));

  // Blank line
  lines.push(colors.dim(BOX.vertical) + " ".repeat(innerWidth + 2) + colors.dim(BOX.vertical));

  // Stats line
  const tokensStr = totalTokens.toLocaleString();
  const co2Str = formatCO2(result.co2_grams);
  const statsLine = `  Tokens: ${tokensStr}     CO2: ${co2Str} (estimated)`;
  lines.push(colors.dim(BOX.vertical) + statsLine.padEnd(innerWidth + 2) + colors.dim(BOX.vertical));

  // Bar + metaphor compact
  const charges = result.equivalents.phone_charges.toFixed(2);
  const barLine = `  ${renderBar(result.co2_grams, 50, 16)}  ${charges} phone charges`;
  lines.push(colors.dim(BOX.vertical) + barLine.padEnd(innerWidth + 2) + colors.dim(BOX.vertical));

  // Blank line
  lines.push(colors.dim(BOX.vertical) + " ".repeat(innerWidth + 2) + colors.dim(BOX.vertical));

  // Metaphors
  const metaphorLines = renderMetaphors(result.equivalents).split("\n");
  for (const ml of metaphorLines.slice(0, 3)) {
    lines.push(colors.dim(BOX.vertical) + ml.padEnd(innerWidth + 2) + colors.dim(BOX.vertical));
  }

  // Bottom border
  lines.push(colors.dim(`${BOX.bottomLeft}${hr}${BOX.bottomRight}`));

  return lines.join("\n");
}
