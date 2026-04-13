import type { CodingComparison } from "../../core/types.js";
import { colors } from "../colors.js";
import { renderComparisonBars } from "./bar-chart.js";
import { formatCO2 } from "../../core/tone.js";

/**
 * Render the hand-coding vs AI-coding comparison.
 * This is the core message of co2de — showing the carbon cost of convenience.
 */
export function renderComparison(comp: CodingComparison): string {
  const lines: string[] = [];

  lines.push(
    colors.bold("\u{1F4A8} AI Coding vs Hand Coding — This Session"),
  );
  lines.push("");
  lines.push(
    `  You generated ~${comp.lines_of_code.toLocaleString()} lines with AI assistance.`,
  );
  lines.push("");

  // AI section
  lines.push(colors.bold("  AI coding (this session):"));
  lines.push(
    `    ${comp.ai_tokens.toLocaleString()} tokens \u2192 ${formatCO2(comp.ai_co2_grams)} CO2`,
  );
  lines.push(
    `    Time: ${comp.ai_time_minutes.toFixed(0)} minutes`,
  );
  lines.push("");

  // Hand coding section
  lines.push(colors.bold("  Hand coding estimate (same output):"));
  lines.push(
    `    Laptop only \u2192 ${formatCO2(comp.hand_co2_grams)} CO2`,
  );
  const handHours = comp.hand_time_minutes / 60;
  lines.push(
    `    Time: ~${handHours.toFixed(1)} hours (avg 3 lines/min)`,
  );
  lines.push("");

  // Comparison bars
  lines.push(renderComparisonBars(comp.hand_co2_grams, comp.ai_co2_grams));

  // Multiplier
  if (comp.multiplier > 1) {
    lines.push(
      colors.yellow(
        `                              ${comp.multiplier.toFixed(0)}x more`,
      ),
    );
  }
  lines.push("");

  // The message
  lines.push(
    `  AI coding: ${colors.red(comp.multiplier.toFixed(0) + "x")} more carbon, ${colors.green(
      (comp.hand_time_minutes / comp.ai_time_minutes).toFixed(0) + "x",
    )} faster.`,
  );
  lines.push(
    colors.dim(
      '  The question isn\'t "which is less" —',
    ),
  );
  lines.push(
    colors.dim(
      '  it\'s "are you aware of the cost of convenience?"',
    ),
  );

  return lines.join("\n");
}
