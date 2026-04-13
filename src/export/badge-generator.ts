import { formatCO2 } from "../core/tone.js";

/**
 * Generate shields.io badge URLs and markdown for README.
 */
export function generateBadge(
  co2Grams: number,
  isOffset = false,
): { markdown: string; url: string } {
  const co2Text = formatCO2(co2Grams);
  const color = isOffset ? "green" : co2Grams > 100 ? "red" : co2Grams > 10 ? "orange" : "yellow";
  const icon = isOffset ? "🌍" : "🏭";
  const label = isOffset ? `${icon} CO2 (offset)` : `${icon} CO2`;

  // shields.io static badge format
  const encodedLabel = encodeURIComponent(label);
  const encodedValue = encodeURIComponent(co2Text);
  const url = `https://img.shields.io/badge/${encodedLabel}-${encodedValue}-${color}`;

  const markdown = `[![co2de](${url})](https://github.com/anthropics/co2de)`;

  return { markdown, url };
}
