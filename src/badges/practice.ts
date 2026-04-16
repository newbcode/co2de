import type { TokenUsage } from "../core/types.js";
import type { DetailedSession } from "../adapters/claude.js";
import { countLinesWritten, listProjectDirs, listSessionFiles } from "../adapters/claude.js";

/**
 * Practice badges — threshold-based, NOT ranked.
 *
 * Each qualifier surfaces a single measurable habit. A repo either
 * clears the bar or it doesn't; we do not compare repos against each
 * other. Thresholds calibrated off typical agent-coding sessions —
 * they represent "reasonably practiced", not "best in show".
 */

export interface PracticeBadge {
  key: "lean" | "stable" | "concise" | "disclosed";
  qualifies: boolean;
  label: string;       // e.g. "lean"
  value: string;       // e.g. "2.1 g/line"
  note: string;        // explanation for disclosure page
}

export interface PracticeInput {
  /** Minimal shape: anything with co2_grams works (DetailedSession or SessionSummary). */
  sessions: Array<{ co2_grams: number }>;
  entries: TokenUsage[];
  linesWritten: number;
}

/** Thresholds tuned off observed agent-coding distributions. */
export const THRESHOLDS = {
  leanGPerLine:     10,     // ≤ 10 g CO2 per line written
  stableCacheHit:   90,     // ≥ 90% weighted cache hit rate
  conciseInputTok:  1500,   // ≤ 1500 input tokens per turn (excluding cache_read)
};

export function computePractice(input: PracticeInput): PracticeBadge[] {
  const { sessions, entries, linesWritten } = input;

  const totalG = sessions.reduce((s, x) => s + x.co2_grams, 0);
  const totalCR = entries.reduce((s, e) => s + e.cache_read_tokens, 0);
  const totalCW = entries.reduce((s, e) => s + e.cache_write_tokens, 0);
  const totalIn = entries.reduce((s, e) => s + e.input_tokens, 0);
  const cacheTotal = totalIn + totalCW + totalCR;
  const cacheHitPct = cacheTotal > 0 ? (totalCR / cacheTotal) * 100 : 0;
  const gPerLine = linesWritten > 0 ? totalG / linesWritten : Infinity;
  const avgInputPerTurn = entries.length > 0 ? totalIn / entries.length : 0;

  const lean: PracticeBadge = {
    key: "lean",
    qualifies: Number.isFinite(gPerLine) && gPerLine <= THRESHOLDS.leanGPerLine,
    label: "lean",
    value: Number.isFinite(gPerLine) ? `${gPerLine.toFixed(1)} g/line` : "n/a",
    note: "CO₂ per line of code written via Write/Edit tools. Threshold: ≤ 10 g/line.",
  };
  const stable: PracticeBadge = {
    key: "stable",
    qualifies: cacheHitPct >= THRESHOLDS.stableCacheHit,
    label: "stable",
    value: `${cacheHitPct.toFixed(0)}%`,
    note: "Weighted cache-read ratio across sessions. Indicates session continuity habits (few /clear, stable CLAUDE.md). Threshold: ≥ 90%.",
  };
  const concise: PracticeBadge = {
    key: "concise",
    qualifies: avgInputPerTurn > 0 && avgInputPerTurn <= THRESHOLDS.conciseInputTok,
    label: "concise",
    value: `${Math.round(avgInputPerTurn)} tok/turn`,
    note: "Average new-input tokens per turn (excluding cache-read). Reflects prompt brevity. Threshold: ≤ 1500 tokens/turn.",
  };
  const disclosed: PracticeBadge = {
    key: "disclosed",
    qualifies: true,
    label: "carbon",
    value: "disclosed",
    note: "The repository publishes co2de carbon metrics. Disclosure is the virtue — no score, no ranking.",
  };

  return [lean, stable, concise, disclosed];
}

/**
 * Aggregate all recent sessions + entries + lines-written for a project.
 * Uses past 30 days as the reporting window for practice badges.
 */
export function countProjectLinesWritten(projectPath: string): number {
  // Walk every session file in every known project dir and sum lines.
  // We can't easily limit to one project from encoded dir names alone —
  // callers that want project-specific lines can pass specific files.
  let total = 0;
  for (const dir of listProjectDirs()) {
    if (!dir.includes(encodePath(projectPath))) continue;
    for (const f of listSessionFiles(dir)) {
      total += countLinesWritten(f);
    }
  }
  return total;
}

function encodePath(p: string): string {
  return p.replace(/\//g, "-");
}
