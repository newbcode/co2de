import chalk from "chalk";
import type { EmissionLevel } from "../core/types.js";

/**
 * Respects NO_COLOR environment variable (https://no-color.org/).
 * chalk auto-detects this, but we expose helpers for consistent usage.
 */
const noColor = !!process.env["NO_COLOR"];

export const colors = {
  // Emission level colors
  low: noColor ? (s: string) => s : chalk.green,
  medium: noColor ? (s: string) => s : chalk.yellow,
  high: noColor ? (s: string) => s : chalk.magenta,
  extreme: noColor ? (s: string) => s : chalk.red,

  // UI element colors
  dim: noColor ? (s: string) => s : chalk.dim,
  bold: noColor ? (s: string) => s : chalk.bold,
  cyan: noColor ? (s: string) => s : chalk.cyan,
  green: noColor ? (s: string) => s : chalk.green,
  yellow: noColor ? (s: string) => s : chalk.yellow,
  red: noColor ? (s: string) => s : chalk.red,
  magenta: noColor ? (s: string) => s : chalk.magenta,
  blue: noColor ? (s: string) => s : chalk.blue,
  white: noColor ? (s: string) => s : chalk.white,
  gray: noColor ? (s: string) => s : chalk.gray,
};

export function colorForLevel(
  level: EmissionLevel,
): (s: string) => string {
  return colors[level];
}

/**
 * Bar characters for charts.
 * Full blocks for filled portions, light shade for empty.
 */
export const BAR = {
  filled: "\u2588", // █
  empty: "\u2591", // ░
  half: "\u2592", // ▒
  dense: "\u2593", // ▓
};

/**
 * Box drawing characters for banners.
 */
export const BOX = {
  topLeft: "\u250C", // ┌
  topRight: "\u2510", // ┐
  bottomLeft: "\u2514", // └
  bottomRight: "\u2518", // ┘
  horizontal: "\u2500", // ─
  vertical: "\u2502", // │
};
