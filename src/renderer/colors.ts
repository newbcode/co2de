import chalk from "chalk";
import type { EmissionLevel } from "../core/types.js";

export const colors = {
  low: chalk.green,
  medium: chalk.yellow,
  high: chalk.magenta,
  extreme: chalk.red,
  dim: chalk.dim,
  bold: chalk.bold,
  green: chalk.green,
  yellow: chalk.yellow,
  red: chalk.red,
  magenta: chalk.magenta,
};

export function colorForLevel(level: EmissionLevel): (s: string) => string {
  if (level === "low") return colors.dim;
  if (level === "medium") return colors.yellow;
  if (level === "high") return colors.red;
  return (s: string) => colors.bold(colors.red(s)); // extreme = bold red
}

/** Bar characters for charts. */
export const BAR = {
  filled: "\u2588", // █
  empty: "\u2591", // ░
  half: "\u2592", // ▒
  dense: "\u2593", // ▓
};

/** Box drawing characters for banners. */
export const BOX = {
  topLeft: "\u250C", // ┌
  topRight: "\u2510", // ┐
  bottomLeft: "\u2514", // └
  bottomRight: "\u2518", // ┘
  horizontal: "\u2500", // ─
  vertical: "\u2502", // │
};
