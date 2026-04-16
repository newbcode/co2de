import type { SessionSummary, PaceProjection, DeltaBadge } from "../core/types.js";

/**
 * Annual emission projection from a set of sessions observed in a period.
 *
 * Rationale: single-session CO2 looks trivial (~0.3g per chat query, a few
 * kilos per session). Annualized, the same usage pattern is tens of kilos
 * per year. Showing projection next to the absolute number escapes the
 * "this is too small to matter" dismissal (Sustainability by Numbers 2025).
 *
 * Uses a simple linear projection: weekly × 52.
 */
export function computePace(sessions: SessionSummary[]): PaceProjection {
  const weekly = sessions.reduce((s, x) => s + x.co2_grams, 0);
  return {
    weekly_grams: weekly,
    annual_grams: weekly * 52,
    sessions_observed: sessions.length,
  };
}

/**
 * Self-comparison delta for a single value against the user's own baseline.
 *
 * Uses MEDIAN of past sessions (excluding the latest) as baseline, since
 * mean is distorted by occasional heavy sessions. Returns an injunctive
 * glyph (Opower-style cue):
 *
 *   ·    baseline: within 1.2x of median — neither above nor heavy
 *   ▲    above:    1.2x < delta ≤ 2.5x
 *   ⚠    heavy:    delta > 2.5x (~2σ)
 *
 * Confidence floor: n < 5 returns baseline glyph with confident=false —
 * avoids premature labeling. Never compares to anyone else's data:
 * comparison against peers triggers boomerang effect (Schultz 2007).
 */
export function computeDelta(
  latestGrams: number,
  historicalSessions: SessionSummary[],
): DeltaBadge {
  const sampleSize = historicalSessions.length;
  const empty: DeltaBadge = {
    glyph: "·",
    multiplier: 1,
    baseline_grams: 0,
    sample_size: sampleSize,
    confident: false,
  };

  if (sampleSize < 5) return empty;

  const sorted = [...historicalSessions]
    .map((s) => s.co2_grams)
    .filter((g) => g > 0)
    .sort((a, b) => a - b);

  if (sorted.length === 0) return empty;

  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  if (median === 0) return empty;

  const multiplier = latestGrams / median;
  let glyph: DeltaBadge["glyph"] = "·";
  if (multiplier > 2.5) glyph = "⚠";
  else if (multiplier > 1.2) glyph = "▲";

  return {
    glyph,
    multiplier,
    baseline_grams: median,
    sample_size: sorted.length,
    confident: true,
  };
}

/**
 * Format a delta badge as a short text suffix, e.g. "▲ 2.1× your baseline".
 * Returns empty string if not confident — don't nag when we don't know.
 */
export function formatDelta(d: DeltaBadge): string {
  if (!d.confident || d.glyph === "·") return "";
  return `${d.glyph} ${d.multiplier.toFixed(1)}× your median session`;
}
