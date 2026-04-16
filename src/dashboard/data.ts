import type { TokenUsage } from "../core/types.js";
import type { DetailedSession } from "../adapters/claude.js";
import { calculateCarbon } from "../engine/carbon-calculator.js";
import { computePace, computeDelta } from "../engine/pace.js";
import { CARBON_INTENSITY_GCO2_PER_KWH } from "../core/constants.js";

export interface DashboardTurn {
  t: string;        // HH:MM
  g: number;        // grams CO2e
  m: string;        // short model name
  kind: string;     // heuristic classification
  annoIdx?: number; // 0..N if this turn is annotated
}

export interface DashboardAnnotation {
  ts: string;       // "14:23 · turn 7"
  what: string;
  detail: string;   // may include HTML span.accent
}

export interface DashboardModelBar {
  name: string;
  kg: number;
  tokens: number;
  share: number;    // 0..1
  phantomKg?: number; // outline reach — only set on the heaviest model
}

export interface DashboardDay {
  date: string;         // ISO YYYY-MM-DD
  kg: number;
  sessions: number;
  dayOfWeek: number;    // 0 = Mon, 6 = Sun
  isToday: boolean;
}

export interface DashboardData {
  periodLabel: string;
  sessionCount: number;
  region: string;
  regionGCO2: number;
  inferenceRegion: string;
  inferenceRegionGCO2: number;

  // Hero
  weeklyKg: number;
  annualKg: number;
  paceHelper: string;       // "≈ a one-way flight NYC→LAX per year"
  deltaText: string;        // "▲ 2.1× your March baseline" or ""
  weekly7: { day: string; kg: number }[];

  // Soot Calendar — 30 days of footprints
  calendar: DashboardDay[];
  calendarTotalKg: number;
  calendarSessions: number;

  // Anatomy of a turn — where the tokens go
  anatomy: {
    turnCount: number;
    avgCacheReadTok: number;
    avgCacheWriteTok: number;
    avgInputTok: number;
    avgOutputTok: number;
    avgCacheReadG: number;
    avgCacheWriteG: number;
    avgInputG: number;
    avgOutputG: number;
    avgTurnG: number;
    dominantModel: string;
  };

  // Soot ledger — featured session turns
  featured: {
    dateLabel: string;      // "Apr 13 · nextjs-blog · opus · ~4.65kg"
    project: string;
    model: string;
    totalGrams: number;
    turnCount: number;
    startLabel: string;     // "06:12"
    midLabel: string;
    endLabel: string;
    turns: DashboardTurn[];
    annotations: DashboardAnnotation[];
  };

  // Phantom layer
  modelBars: DashboardModelBar[];
  baselineKg: number;      // weekly total for slider math
  opusKg: number;          // opus share for slider math
  avoidablePoolKg: number; // weekly × 0.35 (audit heuristic)
}

function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * Pick the heaviest recent session to feature in Soot Ledger + Session Replay.
 * Heavy sessions have enough turns for the visualizations to be informative.
 */
export function pickFeaturedSession(sessions: DetailedSession[]): DetailedSession | null {
  if (sessions.length === 0) return null;
  const viable = sessions.filter((s) => s.entry_count >= 5 && s.co2_grams > 0);
  const pool = viable.length > 0 ? viable : sessions;
  return pool.reduce((a, b) => (a.co2_grams > b.co2_grams ? a : b));
}

/**
 * Heuristic turn classification from token shape.
 * We don't have tool/message metadata in the adapter, so infer from counts.
 */
function classifyTurn(turn: TokenUsage): string {
  const out = turn.output_tokens;
  const cw = turn.cache_write_tokens;
  const model = turn.model.toLowerCase();

  if (out < 50) return "cache hit";
  if (cw > 10_000) return "new context";
  if (out > 3000) return "generate";
  if (out > 500 && model.includes("opus")) return "opus thinking";
  if (out > 500) return "reasoning";
  return "tool call";
}

/**
 * Shape per-turn dashboard view from real TokenUsage[].
 * Picks top hot turns for annotation markers.
 */
export function shapeFeaturedTurns(
  entries: TokenUsage[],
  totalGrams: number,
  region: string,
): { turns: DashboardTurn[]; annotations: DashboardAnnotation[] } {
  const billable = entries.filter(
    (e) => e.input_tokens + e.output_tokens + e.cache_read_tokens + e.cache_write_tokens > 0,
  );

  const withCO2 = billable.map((e) => ({
    entry: e,
    co2: calculateCarbon(e, region).co2_grams,
  }));

  // Top 5 hot turns by CO2, ordered by their position in the session
  const hotIndices = withCO2
    .map((x, i) => ({ i, co2: x.co2 }))
    .sort((a, b) => b.co2 - a.co2)
    .slice(0, Math.min(6, withCO2.length))
    .map((x) => x.i)
    .sort((a, b) => a - b);

  const turns: DashboardTurn[] = withCO2.map((x, i) => {
    const kind = classifyTurn(x.entry);
    const annoIdx = hotIndices.indexOf(i);
    const turn: DashboardTurn = {
      t: hhmm(x.entry.timestamp),
      g: Math.max(1, Math.round(x.co2)),
      m: shortModelName(x.entry.model),
      kind,
    };
    if (annoIdx >= 0) turn.annoIdx = annoIdx;
    return turn;
  });

  const annotations: DashboardAnnotation[] = hotIndices.map((idx, rank) => {
    const turn = turns[idx];
    const pct = totalGrams > 0 ? (turn.g / totalGrams) * 100 : 0;
    const pctText = pct >= 10 ? ` · ${pct.toFixed(0)}% of session` : "";

    let what = "Hot turn";
    if (turn.kind === "opus thinking") what = "Opus thinking burst";
    else if (turn.kind === "generate")  what = "Large generation";
    else if (turn.kind === "new context") what = "New context loaded";
    else if (turn.kind === "reasoning") what = "Reasoning turn";

    const gFmt = turn.g >= 1000
      ? `${(turn.g / 1000).toFixed(2)} kg`
      : `${turn.g} g`;

    return {
      ts: `${turn.t} · turn ${idx + 1}`,
      what,
      detail: `<span class="accent">+${gFmt}</span>${pctText} · ${turn.m}`,
    };
  });

  return { turns, annotations };
}

function shortModelName(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  return model.slice(0, 8);
}

function dayOfWeekShort(d: Date): string {
  return ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"][(d.getDay() + 6) % 7];
}

function paceHelper(annualGrams: number): string {
  const t = annualGrams / 1_000_000;
  if (t >= 2) return `roughly ${t.toFixed(1)}× the per-capita annual emissions of a small EU country`;
  if (t >= 1) return `≈ one transatlantic economy flight per year`;
  if (t >= 0.2) return `≈ 500 km of gasoline car driving per year`;
  return "tiny per session, meaningful annualized";
}

/**
 * Compute per-turn averages and energy cost of each token category.
 * Used by the "Anatomy of a Turn" dashboard section to open the black box.
 */
export function computeAnatomy(
  entries: TokenUsage[],
  region: string,
): DashboardData["anatomy"] {
  const billable = entries.filter(
    (e) => e.input_tokens + e.output_tokens + e.cache_read_tokens + e.cache_write_tokens > 0,
  );
  const n = Math.max(1, billable.length);

  const sumCR = billable.reduce((s, e) => s + e.cache_read_tokens, 0);
  const sumCW = billable.reduce((s, e) => s + e.cache_write_tokens, 0);
  const sumIn = billable.reduce((s, e) => s + e.input_tokens, 0);
  const sumOut = billable.reduce((s, e) => s + e.output_tokens, 0);

  // Dominant model — the one with the most turns
  const modelCount = new Map<string, number>();
  for (const e of billable) modelCount.set(e.model, (modelCount.get(e.model) ?? 0) + 1);
  const dominantModel = [...modelCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  // Build a representative "average turn" TokenUsage and run it through
  // the real carbon calculator — guarantees we match the numbers shown
  // everywhere else.
  const avgTurn = {
    input_tokens:       Math.round(sumIn / n),
    output_tokens:      Math.round(sumOut / n),
    cache_read_tokens:  Math.round(sumCR / n),
    cache_write_tokens: Math.round(sumCW / n),
    model: dominantModel,
    provider: "claude",
    timestamp: "",
    session_id: "",
  };

  // Isolate each category's CO2 by computing partial turns.
  const zero = { ...avgTurn, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
  const crG = calculateCarbon({ ...zero, cache_read_tokens:  avgTurn.cache_read_tokens  }, region).co2_grams;
  const cwG = calculateCarbon({ ...zero, cache_write_tokens: avgTurn.cache_write_tokens }, region).co2_grams;
  const inG = calculateCarbon({ ...zero, input_tokens:       avgTurn.input_tokens       }, region).co2_grams;
  const outG = calculateCarbon({ ...zero, output_tokens:     avgTurn.output_tokens      }, region).co2_grams;

  return {
    turnCount: billable.length,
    avgCacheReadTok:  avgTurn.cache_read_tokens,
    avgCacheWriteTok: avgTurn.cache_write_tokens,
    avgInputTok:      avgTurn.input_tokens,
    avgOutputTok:     avgTurn.output_tokens,
    avgCacheReadG:  crG,
    avgCacheWriteG: cwG,
    avgInputG:      inG,
    avgOutputG:     outG,
    avgTurnG: crG + cwG + inG + outG,
    dominantModel,
  };
}

export function buildDashboardData(
  allSessions: DetailedSession[],
  featuredSession: DetailedSession,
  featuredTurns: TokenUsage[],
  region: string,
): DashboardData {
  const weeklyGrams = allSessions.reduce((s, x) => s + x.co2_grams, 0);
  const weeklyKg = weeklyGrams / 1000;

  // Simple pace calc — weekly × 52
  const paceSummaries = allSessions.map((s) => ({
    id: s.sessionId, provider: "claude",
    model: s.models[0] ?? "unknown",
    timestamp: s.last_activity, total_tokens: s.total_tokens,
    co2_grams: s.co2_grams, cost_usd: s.cost_usd,
  }));
  const pace = computePace(paceSummaries);
  const annualKg = pace.annual_grams / 1000;

  // Delta for featured session
  const baseline = paceSummaries.filter((s) => s.id !== featuredSession.sessionId);
  const delta = computeDelta(featuredSession.co2_grams, baseline);
  const deltaText = delta.confident && delta.glyph !== "·"
    ? `${delta.glyph} ${delta.multiplier.toFixed(1)}× your median session`
    : "";

  // Weekly 7-day breakdown
  const weekly7: { day: string; kg: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const sum = allSessions
      .filter((s) => s.last_activity.slice(0, 10) === dateStr)
      .reduce((ss, s) => ss + s.co2_grams, 0);
    weekly7.push({ day: dayOfWeekShort(d), kg: sum / 1000 });
  }

  // 52-week footprint calendar — GitHub-style year view.
  // Start on the Monday of the week 52 weeks ago so weeks align cleanly.
  const todayStr = now.toISOString().slice(0, 10);
  const calendar: DashboardDay[] = [];
  const startBack = 52 * 7;
  const startBase = new Date(now);
  startBase.setDate(startBase.getDate() - startBack);
  // Roll back to Monday
  while (((startBase.getDay() + 6) % 7) !== 0) {
    startBase.setDate(startBase.getDate() - 1);
  }
  for (let i = 0; i <= startBack; i++) {
    const d = new Date(startBase);
    d.setDate(d.getDate() + i);
    if (d > now) break;
    const dateStr = d.toISOString().slice(0, 10);
    const dayEntries = allSessions.filter((s) => s.last_activity.slice(0, 10) === dateStr);
    const kg = dayEntries.reduce((s, e) => s + e.co2_grams, 0) / 1000;
    calendar.push({
      date: dateStr,
      kg,
      sessions: dayEntries.length,
      dayOfWeek: (d.getDay() + 6) % 7,
      isToday: dateStr === todayStr,
    });
  }
  const calendarTotalKg = calendar.reduce((s, d) => s + d.kg, 0);
  const calendarSessions = calendar.reduce((s, d) => s + d.sessions, 0);

  // Featured session data
  const { turns, annotations } = shapeFeaturedTurns(
    featuredTurns, featuredSession.co2_grams, region,
  );
  const featStart = featuredTurns[0]?.timestamp ?? featuredSession.last_activity;
  const featEnd = featuredTurns[featuredTurns.length - 1]?.timestamp ?? featuredSession.last_activity;
  const featMidIdx = Math.floor(featuredTurns.length / 2);
  const featMid = featuredTurns[featMidIdx]?.timestamp ?? featStart;

  // Model breakdown across all week
  const modelMap = new Map<string, { kg: number; tokens: number }>();
  for (const s of allSessions) {
    const validModels = s.models.filter((m) => m);
    const share = validModels.length > 0 ? 1 / validModels.length : 0;
    for (const mRaw of validModels) {
      const name = shortModelName(mRaw);
      const ex = modelMap.get(name) ?? { kg: 0, tokens: 0 };
      ex.kg += (s.co2_grams / 1000) * share;
      ex.tokens += s.total_tokens * share;
      modelMap.set(name, ex);
    }
  }
  const modelTotalKg = [...modelMap.values()].reduce((s, v) => s + v.kg, 0);
  const sorted = [...modelMap.entries()].sort((a, b) => b[1].kg - a[1].kg);
  const modelBars: DashboardModelBar[] = sorted.map(([name, v], i) => ({
    name,
    kg: v.kg,
    tokens: v.tokens,
    share: modelTotalKg > 0 ? v.kg / modelTotalKg : 0,
    phantomKg: i === 0 ? weeklyKg : undefined, // heaviest model gets phantom outline = "all this model" ceiling
  }));

  const opusBar = modelBars.find((b) => b.name === "opus");
  const opusKg = opusBar?.kg ?? 0;

  const regionGCO2 = CARBON_INTENSITY_GCO2_PER_KWH[region] ?? CARBON_INTENSITY_GCO2_PER_KWH["global"];
  const usGCO2 = CARBON_INTENSITY_GCO2_PER_KWH["us"];

  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 7);
  const periodLabel = `${formatDate(fromDate)} → ${formatDate(now)}`;

  return {
    periodLabel,
    sessionCount: allSessions.length,
    region,
    regionGCO2,
    inferenceRegion: "us",
    inferenceRegionGCO2: usGCO2,

    weeklyKg,
    annualKg,
    paceHelper: paceHelper(pace.annual_grams),
    deltaText,
    weekly7,

    calendar,
    calendarTotalKg,
    calendarSessions,

    anatomy: computeAnatomy(featuredTurns, region),

    featured: {
      dateLabel: `${formatDate(new Date(featStart))} · ${featuredSession.project} · ${shortModelName(featuredSession.models[0] ?? "")} · ~${(featuredSession.co2_grams / 1000).toFixed(2)} kg`,
      project: featuredSession.project,
      model: shortModelName(featuredSession.models[0] ?? ""),
      totalGrams: featuredSession.co2_grams,
      turnCount: turns.length,
      startLabel: hhmm(featStart),
      midLabel: hhmm(featMid),
      endLabel: hhmm(featEnd),
      turns,
      annotations,
    },

    modelBars,
    baselineKg: weeklyKg,
    opusKg,
    avoidablePoolKg: weeklyKg * 0.35,
  };
}

function formatDate(d: Date): string {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}
