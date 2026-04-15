import { collectAllSessions, type DetailedSession } from "../adapters/claude.js";
import { colors, colorForLevel } from "../renderer/colors.js";
import { getEmissionLevel } from "../core/tone.js";
import {
  fmtTokens, fmtCO2, approxCO2, fmtCost, fmtDate, fmtDateFull,
  shortModel, modelTag, boxRow,
  precisionBar, weightedCacheHit, coloredCO2,
} from "../renderer/format.js";
import { createContext, daysAgo } from "./shared.js";

/** Format model list to fit in 7-char column with ANSI padding */
function fmtModels(models: string[]): string {
  const tags = models.map(shortModel).filter(Boolean);
  if (tags.length === 0) return colors.dim("?".padEnd(7));
  if (tags.length === 1) {
    const t = tags[0];
    const colored = modelTag(models.find((m) => shortModel(m) === t) ?? t);
    const pad = Math.max(0, 7 - t.length);
    return colored + " ".repeat(pad);
  }
  // Multiple models: abbreviate. e.g. "O+H" for opus+haiku
  const abbrevs = tags.map((t) => t === "opus" ? "O" : t === "sonnet" ? "S" : t === "haiku" ? "H" : t[0].toUpperCase());
  const raw = abbrevs.join("+");
  const pad = Math.max(0, 7 - raw.length);
  return colors.dim(raw) + " ".repeat(pad);
}

// ─── Metric Card (top section) ───────────────────────────

function renderMetricCard(sessions: DetailedSession[]): string[] {
  const lines: string[] = [];
  const totalCost = sessions.reduce((s, e) => s + e.cost_usd, 0);
  const totalCO2 = sessions.reduce((s, e) => s + e.co2_grams, 0);
  const totalTokens = sessions.reduce((s, e) => s + e.total_tokens, 0);
  const avgHit = weightedCacheHit(sessions);
  const projects = new Set(sessions.map((s) => s.project));

  const co2Level = getEmissionLevel(totalCO2);
  const co2Color = colorForLevel(co2Level);

  const w = 62;
  const dhr = "═".repeat(w);

  const row = (text: string) => boxRow(text, w);

  const cacheColor = avgHit >= 80 ? colors.green : avgHit >= 50 ? colors.yellow : colors.red;
  const cacheBar = precisionBar(avgHit, 100, 12, cacheColor);

  lines.push(colors.dim(`╔${dhr}╗`));
  lines.push(row(`${colors.bold("COST")}  ${colors.dim(fmtCost(totalCost).padStart(10))}     ${colors.bold("CO\u2082")}  ${co2Color(approxCO2(totalCO2).padStart(10))}     ${colors.bold("CACHE")}  ${cacheColor(avgHit.toFixed(0) + "%")}`));
  lines.push(row(`${sessions.length} ses · ${projects.size} proj · ${fmtTokens(totalTokens)} tok${"".padStart(12)}${cacheBar}`));
  lines.push(colors.dim(`╚${dhr}╝`));

  return lines;
}

// ─── Project Overview Table ──────────────────────────────

interface ProjectAgg {
  name: string;
  sessions: number;
  tokens: number;
  cost: number;
  co2: number;
  cacheHit: number;
}

function renderProjectTable(projectAggs: ProjectAgg[]): string[] {
  const lines: string[] = [];
  const maxCO2 = Math.max(...projectAggs.map((p) => p.co2), 1);
  const barW = 16;

  lines.push("");
  lines.push(
    `  ${colors.dim("PROJECT".padEnd(22))} ${colors.dim("SES".padStart(3))}  ${colors.dim("TOKENS".padStart(8))}  ${colors.dim("COST".padStart(8))}  ${colors.dim("CO\u2082".padStart(8))}  ${colors.dim("HIT".padStart(4))}  ${colors.dim("EMISSION".padEnd(barW))}`,
  );
  lines.push(colors.dim(`  ${"─".repeat(22)} ${"─".repeat(3)}  ${"─".repeat(8)}  ${"─".repeat(8)}  ${"─".repeat(8)}  ${"─".repeat(4)}  ${"─".repeat(barW)}`));

  for (const p of projectAggs) {
    const level = getEmissionLevel(p.co2);
    const co2Color = colorForLevel(level);
    const bar = precisionBar(p.co2, maxCO2, barW, co2Color);

    lines.push(
      `  ${p.name.slice(0, 22).padEnd(22)} ${String(p.sessions).padStart(3)}  ${fmtTokens(p.tokens).padStart(8)}  ${colors.dim(fmtCost(p.cost).padStart(8))}  ${co2Color(fmtCO2(p.co2).padStart(8))}  ${colors.dim((p.cacheHit.toFixed(0) + "%").padStart(4))}  ${bar}`,
    );
  }

  // Total row
  const totalSes = projectAggs.reduce((s, p) => s + p.sessions, 0);
  const totalTok = projectAggs.reduce((s, p) => s + p.tokens, 0);
  const totalCost = projectAggs.reduce((s, p) => s + p.cost, 0);
  const totalCO2 = projectAggs.reduce((s, p) => s + p.co2, 0);
  // Use the largest project's weighted approach; recompute from agg values
  // (projectAggs already use weighted cache hit from raw tokens)
  const totalCR = projectAggs.reduce((s, p) => s + p.tokens * (p.cacheHit / 100), 0);
  const avgHit = totalTok > 0 ? (totalCR / totalTok) * 100 : 0;

  lines.push(colors.dim(`  ${"─".repeat(22)} ${"─".repeat(3)}  ${"─".repeat(8)}  ${"─".repeat(8)}  ${"─".repeat(8)}  ${"─".repeat(4)}  ${"─".repeat(barW)}`));

  const totalLevel = getEmissionLevel(totalCO2);
  const totalCo2Color = colorForLevel(totalLevel);
  lines.push(
    `  ${colors.bold("TOTAL".padEnd(22))} ${colors.bold(String(totalSes).padStart(3))}  ${colors.bold(fmtTokens(totalTok).padStart(8))}  ${colors.bold(colors.dim(fmtCost(totalCost).padStart(8)))}  ${colors.bold(totalCo2Color(fmtCO2(totalCO2).padStart(8)))}  ${colors.dim((avgHit.toFixed(0) + "%").padStart(4))}`,
  );

  return lines;
}

// ─── Session Detail Section ──────────────────────────────

function renderSessionDetail(
  sortedProjects: [string, DetailedSession[]][],
  maxCO2: number,
): string[] {
  const lines: string[] = [];
  const barW = 12;

  lines.push("");
  lines.push(colors.bold("  SESSION DETAIL"));
  lines.push(
    `  ${colors.dim("#".padStart(3))}  ${colors.dim("DATE".padEnd(6))}  ${colors.dim("MODEL".padEnd(7))}  ${colors.dim("TOKENS".padStart(8))}  ${colors.dim("IN".padStart(7))}  ${colors.dim("OUT".padStart(7))}  ${colors.dim("CW".padStart(7))}  ${colors.dim("CR".padStart(7))}  ${colors.dim("COST".padStart(7))}  ${colors.dim("CO\u2082".padStart(7))}  ${colors.dim("HIT".padStart(4))}  ${colors.dim("".padEnd(barW))}`,
  );
  lines.push(colors.dim(`  ${"─".repeat(3)}──${"─".repeat(6)}──${"─".repeat(7)}──${"─".repeat(8)}──${"─".repeat(7)}──${"─".repeat(7)}──${"─".repeat(7)}──${"─".repeat(7)}──${"─".repeat(7)}──${"─".repeat(7)}──${"─".repeat(4)}──${"─".repeat(barW)}`));

  let idx = 0;
  for (const [project, sessions] of sortedProjects) {
    // Project separator with subtotal
    const projCost = sessions.reduce((s, e) => s + e.cost_usd, 0);
    const projCO2 = sessions.reduce((s, e) => s + e.co2_grams, 0);
    const projLevel = getEmissionLevel(projCO2);
    const projColor = colorForLevel(projLevel);
    lines.push(`  ${colors.dim("···")}  ${colors.bold(project)}  ${colors.dim("—")} ${colors.dim(fmtCost(projCost))} ${colors.dim("·")} ${projColor(fmtCO2(projCO2))} ${colors.dim("·")} ${sessions.length} ses`);

    for (const s of sessions) {
      idx++;
      const level = getEmissionLevel(s.co2_grams);
      const co2Color = colorForLevel(level);
      const modelStr = fmtModels(s.models);
      const bar = precisionBar(s.co2_grams, maxCO2, barW, co2Color);

      lines.push(
        `  ${colors.dim(String(idx).padStart(3))}  ${colors.dim(fmtDate(s.last_activity).padEnd(6))}  ${modelStr}  ${fmtTokens(s.total_tokens).padStart(8)}  ${colors.dim(fmtTokens(s.input_tokens).padStart(7))}  ${colors.dim(fmtTokens(s.output_tokens).padStart(7))}  ${colors.dim(fmtTokens(s.cache_write_tokens).padStart(7))}  ${colors.dim(fmtTokens(s.cache_read_tokens).padStart(7))}  ${colors.dim(fmtCost(s.cost_usd).padStart(7))}  ${co2Color(fmtCO2(s.co2_grams).padStart(7))}  ${colors.dim((s.cache_hit_pct.toFixed(0) + "%").padStart(4))}  ${bar}`,
      );
    }
  }

  return lines;
}

// ─── Model Breakdown ─────────────────────────────────────

function renderModelBreakdown(sessions: DetailedSession[]): string[] {
  const lines: string[] = [];
  const modelTotals = new Map<string, { tokens: number; cost: number; co2: number; sessions: number }>();

  for (const s of sessions) {
    const validModels = s.models.map(shortModel).filter(Boolean);
    const share = validModels.length > 0 ? 1 / validModels.length : 0;
    for (const name of validModels) {
      const existing = modelTotals.get(name) ?? { tokens: 0, cost: 0, co2: 0, sessions: 0 };
      existing.tokens += s.total_tokens * share;
      existing.cost += s.cost_usd * share;
      existing.co2 += s.co2_grams * share;
      existing.sessions += share;
      modelTotals.set(name, existing);
    }
  }

  if (modelTotals.size <= 1) return [];

  const maxCost = Math.max(...[...modelTotals.values()].map((v) => v.cost), 1);

  lines.push("");
  lines.push(colors.bold("  MODEL BREAKDOWN"));
  for (const [name, data] of [...modelTotals.entries()].sort((a, b) => b[1].cost - a[1].cost)) {
    const bar = precisionBar(data.cost, maxCost, 20, colors.dim);
    lines.push(
      `  ${colors.bold(name.padEnd(8))} ${bar}  ${colors.dim(fmtCost(data.cost).padStart(7))}  ${colors.dim(fmtTokens(data.tokens).padStart(8) + " tok")}  ${coloredCO2(data.co2).padStart(7)}`,
    );
  }

  return lines;
}

// ─── Insights ────────────────────────────────────────────

function renderInsights(sessions: DetailedSession[], projectAggs: ProjectAgg[]): string[] {
  const lines: string[] = [];
  if (sessions.length === 0) return lines;

  // Filter to sessions with actual usage for meaningful insights
  const active = sessions.filter((s) => s.total_tokens > 0 && s.entry_count > 0);
  if (active.length === 0) return lines;

  const topEmitter = active.reduce((a, b) => (a.co2_grams > b.co2_grams ? a : b));
  const mostExpensive = active.reduce((a, b) => (a.cost_usd > b.cost_usd ? a : b));
  const leastCached = active.filter((s) => s.total_tokens > 1000).reduce((a, b) => (a.cache_hit_pct < b.cache_hit_pct ? a : b), active[0]);
  const totalCost = active.reduce((s, e) => s + e.cost_usd, 0);
  const totalCO2 = active.reduce((s, e) => s + e.co2_grams, 0);

  lines.push("");
  lines.push(colors.bold("  INSIGHTS"));

  const topLevel = getEmissionLevel(topEmitter.co2_grams);
  lines.push(
    `  ${colorForLevel(topLevel)("●")} Heaviest session: ${topEmitter.project} ${colors.dim(fmtDate(topEmitter.last_activity))} — ${colorForLevel(topLevel)(approxCO2(topEmitter.co2_grams))} CO\u2082`,
  );
  lines.push(
    `  ${colors.dim("●")} Most expensive: ${mostExpensive.project} ${colors.dim(fmtDate(mostExpensive.last_activity))} — ${fmtCost(mostExpensive.cost_usd)}`,
  );
  if (leastCached.cache_hit_pct < 80) {
    lines.push(
      `  ${colors.red("●")} Lowest cache hit: ${leastCached.project} ${colors.dim(fmtDate(leastCached.last_activity))} — ${colors.red(leastCached.cache_hit_pct.toFixed(0) + "%")} ${colors.dim("(keep stable system prompts)")}`,
    );
  }

  // Avg CO2 per session
  const avgPerSession = totalCO2 / active.length;
  lines.push(
    `  ${colors.dim("●")} Avg per session: ${approxCO2(avgPerSession)}`,
  );

  return lines;
}

// ─── Main Command ────────────────────────────────────────

export async function usageCommand(opts: { all?: boolean; week?: boolean; month?: boolean }): Promise<void> {
  let from: Date | undefined;
  let to: Date | undefined;
  let periodLabel: string;

  const now = new Date();
  to = now;

  if (opts.all) {
    from = undefined;
    to = undefined;
    periodLabel = "All Time";
  } else if (opts.month) {
    from = daysAgo(30);
    periodLabel = `${fmtDateFull(from.toISOString())} → ${fmtDateFull(now.toISOString())}`;
  } else {
    from = daysAgo(7);
    periodLabel = `${fmtDateFull(from.toISOString())} → ${fmtDateFull(now.toISOString())}`;
  }

  const { config } = createContext();
  const sessions = collectAllSessions(from, to, config.region);

  if (sessions.length === 0) {
    console.log(colors.dim("\n  No sessions found for this period.\n"));
    return;
  }

  // ── Header ──
  console.log("");
  console.log(colors.bold("  CO\u2082 EMISSION LEDGER"));
  console.log(colors.dim(`  ${periodLabel}`));
  console.log("");

  // ── Metric Card ──
  for (const line of renderMetricCard(sessions)) console.log(line);

  // ── Group by project ──
  const projectMap = new Map<string, DetailedSession[]>();
  for (const s of sessions) {
    const existing = projectMap.get(s.project) ?? [];
    existing.push(s);
    projectMap.set(s.project, existing);
  }

  // Sort projects by CO2 desc
  const sortedProjects = [...projectMap.entries()].sort(
    (a, b) => b[1].reduce((s, e) => s + e.co2_grams, 0) - a[1].reduce((s, e) => s + e.co2_grams, 0),
  );

  // ── Project Aggregates ──
  const projectAggs: ProjectAgg[] = sortedProjects.map(([name, sess]) => ({
    name,
    sessions: sess.length,
    tokens: sess.reduce((s, e) => s + e.total_tokens, 0),
    cost: sess.reduce((s, e) => s + e.cost_usd, 0),
    co2: sess.reduce((s, e) => s + e.co2_grams, 0),
    cacheHit: weightedCacheHit(sess),
  }));

  for (const line of renderProjectTable(projectAggs)) console.log(line);

  // ── Session Detail ──
  const maxCO2 = Math.max(...sessions.map((s) => s.co2_grams), 1);

  // Sort sessions within each project
  for (const [, sess] of sortedProjects) {
    sess.sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());
  }

  for (const line of renderSessionDetail(sortedProjects, maxCO2)) console.log(line);

  // ── Model Breakdown (only if multiple models) ──
  for (const line of renderModelBreakdown(sessions)) console.log(line);

  // ── Insights ──
  for (const line of renderInsights(sessions, projectAggs)) console.log(line);

  console.log("");
}
