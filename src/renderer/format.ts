/**
 * Shared formatting utilities used across all co2de commands.
 * Single source of truth for token/CO2/cost/date formatting,
 * model display, and precision bar rendering.
 */
import { colors, BAR, colorForLevel } from "./colors.js";
import { formatCO2, getEmissionLevel } from "../core/tone.js";
import type { DetailedSession } from "../adapters/claude.js";

// ─── Token / Number Formatting ───────────────────────────

export function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function fmtNum(n: number): string {
  return n.toLocaleString();
}

// ─── CO2 Formatting (auto kg) ────────────────────────────

/** Format CO2 with automatic g/kg switching */
export function fmtCO2(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(1)}kg`;
  return formatCO2(grams);
}

// ─── Cost Formatting ─────────────────────────────────────

export function fmtCost(usd: number): string {
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}k`;
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  if (usd >= 10) return `$${usd.toFixed(1)}`;
  return `$${usd.toFixed(2)}`;
}

// ─── Date Formatting ─────────────────────────────────────

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2, " ")}`;
}

export function fmtDateFull(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

// ─── Model Display ───────────────────────────────────────

export function shortModel(model: string): string {
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  if (model.startsWith("<") || model === "unknown") return "";
  return model.slice(0, 6);
}

export function modelColor(_model: string): (s: string) => string {
  return colors.dim;
}

export function modelTag(model: string): string {
  const name = shortModel(model);
  if (!name) return "";
  return modelColor(model)(name);
}

// ─── ANSI Utilities ──────────────────────────────────────

export function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

/** Pad a string containing ANSI codes to a visual width */
export function ansiPadEnd(str: string, width: number): string {
  const visLen = stripAnsi(str).length;
  return str + " ".repeat(Math.max(0, width - visLen));
}

// ─── Precision Bar ───────────────────────────────────────

/** Fractional block characters for sub-cell precision (1/8 increments) */
const FRAC = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];

/** Render a bar with 1/8-block precision */
export function precisionBar(
  value: number,
  max: number,
  width: number,
  colorFn: (s: string) => string,
): string {
  if (max <= 0) return colors.dim(BAR.empty.repeat(width));
  const ratio = Math.min(value / max, 1);
  const totalEighths = Math.round(ratio * width * 8);
  const fullBlocks = Math.floor(totalEighths / 8);
  const remainder = totalEighths % 8;
  const emptyBlocks = width - fullBlocks - (remainder > 0 ? 1 : 0);

  return colorFn(BAR.filled.repeat(fullBlocks))
    + (remainder > 0 ? colorFn(FRAC[remainder]) : "")
    + colors.dim(BAR.empty.repeat(Math.max(emptyBlocks, 0)));
}

// ─── Cache Hit ───────────────────────────────────────────

/** Weighted cache hit from raw token counts (excludes output tokens) */
export function weightedCacheHit(sessions: DetailedSession[]): number {
  const totalCR = sessions.reduce((s, e) => s + e.cache_read_tokens, 0);
  const totalInput = sessions.reduce(
    (s, e) => s + e.input_tokens + e.cache_write_tokens + e.cache_read_tokens, 0,
  );
  return totalInput > 0 ? (totalCR / totalInput) * 100 : 0;
}

// ─── Time Ago ────────────────────────────────────────────

export function fmtTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  return `${days}d ago`;
}

// ─── Box Row Helper ──────────────────────────────────────

/** Create a box row: ║ content (padded to width) ║ */
export function boxRow(text: string, width: number): string {
  const rawLen = stripAnsi(text).length;
  return `${colors.dim("║")} ${text}${" ".repeat(Math.max(0, width - 1 - rawLen))}${colors.dim("║")}`;
}

// ─── Section Header ──────────────────────────────────────

/** Render a section header with optional right-aligned stats */
export function sectionHeader(title: string, stats?: string): string {
  const right = stats ? `  ${colors.dim(stats)}` : "";
  return `\n  ${colors.bold(title)}${right}`;
}

// ─── CO2 Colored Value ───────────────────────────────────

/** Format CO2 value with emission-level coloring. kg values are bold. */
export function coloredCO2(grams: number): string {
  const level = getEmissionLevel(grams);
  const color = colorForLevel(level);
  const text = fmtCO2(grams);
  // kg = serious amount → bold for emphasis
  if (grams >= 1000) return colors.bold(color(text));
  return color(text);
}
