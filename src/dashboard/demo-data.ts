import type { DashboardData, DashboardDay, DashboardTurn, DashboardAnnotation, DashboardModelBar } from "./data.js";

/**
 * Demo DashboardData — fills the calendar with realistic activity so the
 * footprint calendar, phantom bars, and session replay are all visibly
 * populated for demo/screenshot purposes.
 *
 * Hardcoded (not random) so the demo renders the same every build.
 * Intensity pattern: weekdays active with occasional heavy outliers;
 * weekends mostly empty.
 */
export function buildDemoDashboardData(region: string): DashboardData {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // 52-week GitHub-style calendar. Deterministic pseudo-random via seeded
  // LCG so the demo renders the same each build.
  const startBack = 52 * 7;
  const startBase = new Date(now);
  startBase.setDate(startBase.getDate() - startBack);
  while (((startBase.getDay() + 6) % 7) !== 0) {
    startBase.setDate(startBase.getDate() - 1);
  }
  let seed = 424242;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const calendar: DashboardDay[] = [];
  let calTotalKg = 0;
  let calSessions = 0;

  for (let i = 0; i <= startBack; i++) {
    const d = new Date(startBase);
    d.setDate(d.getDate() + i);
    if (d > now) break;
    const dateStr = d.toISOString().slice(0, 10);
    const dow = (d.getDay() + 6) % 7;
    const isWeekend = dow >= 5;

    // Activity ramps up over the year; recent months heavier.
    const progress = i / startBack;
    const ramp = 0.25 + progress * 0.65;

    // Base probability of coding that day
    const activeProb = isWeekend ? 0.20 : 0.78;
    const active = rand() < activeProb * ramp;

    let kg = 0;
    if (active) {
      const r = rand();
      if (r < 0.55) kg = 2 + rand() * 8;        // light
      else if (r < 0.88) kg = 8 + rand() * 28;  // medium
      else kg = 28 + rand() * 70;                // heavy
      kg *= ramp;
    }
    const sessions = kg > 0 ? Math.max(1, Math.round(kg / 12)) : 0;

    calendar.push({
      date: dateStr,
      kg: Math.round(kg * 10) / 10,
      sessions,
      dayOfWeek: dow,
      isToday: dateStr === todayStr,
    });
    calTotalKg += kg;
    calSessions += sessions;
  }

  // 7-day sparkline = last 7 days of pattern
  const weekly7 = calendar.slice(-7).map((d) => ({
    day: ["M", "T", "W", "T", "F", "S", "S"][d.dayOfWeek],
    kg: d.kg,
  }));
  const weeklyKg = weekly7.reduce((s, x) => s + x.kg, 0);
  const annualKg = weeklyKg * 52;

  // Featured session — 47 turns, varied intensities
  const featuredTurns: DashboardTurn[] = generateDemoTurns();
  const featuredTotalG = featuredTurns.reduce((s, t) => s + t.g, 0);
  const annotations: DashboardAnnotation[] = [
    { ts: "06:45 · turn 7",  what: "Opus thinking burst",
      detail: '<span class="accent">+1.82 kg</span> · 39% of the whole session in one turn' },
    { ts: "08:12 · turn 13", what: "page.tsx read 5× redundantly",
      detail: "+0.28 kg avoidable · four of them were cache misses" },
    { ts: "09:30 · turn 20", what: "Cache miss spike",
      detail: "+0.34 kg · context grew 4× since session start" },
    { ts: "11:15 · turn 27", what: "Switched to sonnet",
      detail: "rate ↓ to 0.6 g/min for the next 7 turns" },
    { ts: "13:02 · turn 34", what: "Regenerated function",
      detail: '<span class="accent">+0.68 kg</span> · back on opus, new file from scratch' },
    { ts: "14:32 · turn 42", what: "Final opus thinking",
      detail: "+0.42 kg · review pass before wrap-up" },
  ];

  // Phantom model breakdown
  const opusKg  = weeklyKg * 0.80;
  const sonnetKg = weeklyKg * 0.17;
  const haikuKg = weeklyKg * 0.03;
  const modelBars: DashboardModelBar[] = [
    { name: "opus",   kg: opusKg,   tokens: 34_600_000, share: opusKg / weeklyKg, phantomKg: weeklyKg },
    { name: "sonnet", kg: sonnetKg, tokens: 13_700_000, share: sonnetKg / weeklyKg },
    { name: "haiku",  kg: haikuKg,  tokens:  4_000_000, share: haikuKg / weeklyKg },
  ];

  // Period label
  const from = new Date(now); from.setDate(from.getDate() - 7);
  const periodLabel = `${fmtDate(from)} → ${fmtDate(now)}`;

  return {
    periodLabel,
    sessionCount: calSessions,
    region,
    regionGCO2: region === "kr" ? 415 : region === "us" ? 390 : 475,
    inferenceRegion: "us",
    inferenceRegionGCO2: 390,

    weeklyKg,
    annualKg,
    paceHelper: annualKg >= 1000
      ? "roughly 1–2× the per-capita annual emissions of a small EU country"
      : "≈ one transatlantic economy flight per year",
    deltaText: "▲ 2.1× your March baseline",
    weekly7,

    calendar,
    calendarTotalKg: calTotalKg,
    calendarSessions: calSessions,

    // Typical Opus turn composition. Numbers chosen to be realistic for an
    // agentic session with warm cache and tool-heavy turns.
    anatomy: {
      turnCount: 47,
      avgCacheReadTok:  15_000,
      avgCacheWriteTok:    800,
      avgInputTok:         420,
      avgOutputTok:        850,
      // Energies at Opus 0.005 Wh/tok, PUE 1.2, region us 390 gCO2/kWh
      // cr:  15000 × 0.005 × 0.1 × 1.2 / 1000 × 390 = 3.51 g
      // cw:    800 × 0.005 × 1   × 1.2 / 1000 × 390 = 1.87 g
      // in:    420 × 0.005 × 1   × 1.2 / 1000 × 390 = 0.98 g
      // out:   850 × 0.005 × 1   × 1.2 / 1000 × 390 = 1.99 g
      avgCacheReadG:  3.51,
      avgCacheWriteG: 1.87,
      avgInputG:      0.98,
      avgOutputG:     1.99,
      avgTurnG:       8.35,
      dominantModel: "claude-opus-4-7",
    },

    featured: {
      dateLabel: `${fmtDate(new Date())} · demo-project · opus · ~${(featuredTotalG / 1000).toFixed(2)} kg`,
      project: "demo-project",
      model: "opus",
      totalGrams: featuredTotalG,
      turnCount: featuredTurns.length,
      startLabel: "06:12",
      midLabel:  "10:30",
      endLabel:  "14:48",
      turns: featuredTurns,
      annotations,
    },

    modelBars,
    baselineKg: weeklyKg,
    opusKg,
    avoidablePoolKg: weeklyKg * 0.35,
  };
}

function generateDemoTurns(): DashboardTurn[] {
  // Same shape as the original prototype session: mostly light, a few spikes.
  const raw: [string, number, string, string, number?][] = [
    ["06:12", 18,   "opus",   "cache hit"],
    ["06:14", 24,   "opus",   "read page.tsx"],
    ["06:18", 12,   "opus",   "cache hit"],
    ["06:24", 38,   "opus",   "tool call"],
    ["06:30", 22,   "opus",   "cache hit"],
    ["06:41", 46,   "opus",   "read layout.tsx"],
    ["06:45", 1820, "opus",   "opus thinking", 0],
    ["06:58", 40,   "opus",   "cache hit"],
    ["07:12", 28,   "opus",   "tool call"],
    ["07:30", 68,   "opus",   "read page.tsx"],
    ["07:48", 52,   "opus",   "read page.tsx"],
    ["08:05", 48,   "opus",   "read page.tsx"],
    ["08:12", 55,   "opus",   "read page.tsx", 1],
    ["08:20", 36,   "opus",   "cache hit"],
    ["08:34", 30,   "opus",   "cache hit"],
    ["08:52", 70,   "opus",   "write patch"],
    ["09:06", 82,   "opus",   "tool call"],
    ["09:18", 58,   "opus",   "context bloat"],
    ["09:24", 96,   "opus",   "cache miss"],
    ["09:30", 140,  "opus",   "cache miss", 2],
    ["09:36", 104,  "opus",   "cache miss"],
    ["09:45", 62,   "opus",   "tool call"],
    ["10:02", 58,   "opus",   "cache hit"],
    ["10:18", 210,  "opus",   "generate code"],
    ["10:30", 178,  "opus",   "generate code"],
    ["10:45", 92,   "opus",   "cache hit"],
    ["11:15", 40,   "sonnet", "model switch", 3],
    ["11:22", 28,   "sonnet", "refine"],
    ["11:40", 32,   "sonnet", "refine"],
    ["11:58", 22,   "sonnet", "cache hit"],
    ["12:12", 30,   "sonnet", "tool call"],
    ["12:30", 26,   "sonnet", "cache hit"],
    ["12:48", 34,   "sonnet", "refine"],
    ["13:02", 680,  "opus",   "regenerate", 4],
    ["13:08", 120,  "opus",   "cache hit"],
    ["13:20", 92,   "opus",   "cache hit"],
    ["13:34", 88,   "opus",   "review"],
    ["13:48", 70,   "opus",   "cache hit"],
    ["14:00", 54,   "opus",   "cache hit"],
    ["14:12", 48,   "opus",   "cache hit"],
    ["14:22", 62,   "opus",   "tool call"],
    ["14:32", 420,  "opus",   "opus thinking", 5],
    ["14:38", 44,   "opus",   "cache hit"],
    ["14:42", 38,   "opus",   "cache hit"],
    ["14:44", 28,   "opus",   "cache hit"],
    ["14:46", 22,   "opus",   "cache hit"],
    ["14:48", 18,   "opus",   "wrap up"],
  ];
  return raw.map(([t, g, m, kind, annoIdx]) => {
    const turn: DashboardTurn = { t, g, m, kind };
    if (annoIdx !== undefined) turn.annoIdx = annoIdx;
    return turn;
  });
}

function fmtDate(d: Date): string {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}
