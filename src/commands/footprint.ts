import chalk from "chalk";
import { Resvg } from "@resvg/resvg-js";
import { collectAllSessions, collectProjectSessions, type DetailedSession } from "../adapters/claude.js";
import { colors } from "../renderer/colors.js";
import { sectionHeader } from "../renderer/format.js";
import { createContext } from "./shared.js";
import { renderCalendarSVG } from "../badges/calendar-svg.js";
import type { DashboardDay } from "../dashboard/data.js";

/**
 * co2de footprint — year-view carbon footprint calendar in the terminal.
 *
 * Hybrid rendering:
 *   - iTerm2 / WezTerm / Kitty → inline PNG rasterized from the same SVG
 *     used in `co2de readme` and the dashboard. Pixel-for-pixel the same.
 *   - Everything else         → single-char ● heatmap with ANSI 24-bit
 *     color intensity. Clean, alignment-safe.
 *
 * Scope policy matches dashboard/readme: defaults to current project,
 * --all aggregates every project.
 */

// Soot accumulation ramp — paper white → charcoal → rust only at peak.
// Semantics: carbon IS black; a "clean" day reads as near-white,
// a heavy day as dark soot, an extreme day as industrial scarring.
// This preserves an actual gradient (low/mid/high are visually
// distinct) instead of painting every cell as alarm-red.
//
// Low-end stays bright enough that the dark-brown 👣 glyph still
// reads clearly. Only level 4 is red — reserves alarm color for
// the worst days. Matches the dashboard SVG palette.
const SOOT_RGB: [number, number, number][] = [
  [232, 220, 190],   // clean paper cream
  [190, 160, 120],   // warm tan
  [135, 100, 70],    // mid brown (dust & soot mix)
  [70, 50, 35],      // deep charcoal
  [178, 62, 28],     // rust — industrial scarring (peak only)
];
const RUST_TODAY: [number, number, number] = [220, 90, 40];
const EMPTY_BG: [number, number, number] = [45, 40, 36];   // very faint paper

/** ANSI 24-bit background color wrap. */
function bg(rgb: [number, number, number], inner: string): string {
  const [r, g, b] = rgb;
  return `\x1b[48;2;${r};${g};${b}m${inner}\x1b[0m`;
}

// Emoji cell width — all themed emojis are 2-column wide in virtually
// every modern terminal font.
const EMOJI_CELL_W = 2;

export type Style = "footprint" | "paw" | "blocks" | "pollution";

interface StyleDef {
  describe: string;
  cell(intensity: number): string;
  today(): string;
  legend(): string[];
}

/**
 * Visual themes. All themes preserve the pollution tone (no green, no
 * sprout) and the 5-level intensity gradient.
 *
 *   footprint  👣 with soot-tinted backgrounds (default) — classic
 *   paw        🐾 with soot-tinted backgrounds — animal spin
 *   blocks     🟨🟧🟫🟥⬛ fully colored squares — max visibility
 *   pollution  💨🌫️🏭🔥☠️ progression — narrative
 */
const STYLES: Record<Style, StyleDef> = {
  footprint: {
    describe: "Footprints (👣) on soot-tinted tiles",
    cell: (i) => bg(SOOT_RGB[i], "\uD83D\uDC63"),
    today: () => bg(RUST_TODAY, "\uD83D\uDC63"),
    legend: () => [0, 1, 2, 3, 4].map((i) => bg(SOOT_RGB[i], "\uD83D\uDC63")),
  },
  paw: {
    describe: "Paw prints (🐾) on soot-tinted tiles",
    cell: (i) => bg(SOOT_RGB[i], "\uD83D\uDC3E"),
    today: () => bg(RUST_TODAY, "\uD83D\uDC3E"),
    legend: () => [0, 1, 2, 3, 4].map((i) => bg(SOOT_RGB[i], "\uD83D\uDC3E")),
  },
  blocks: {
    // Colored-square emoji progression — fully saturated, highest
    // visibility on any background because each cell IS its own color.
    describe: "Colored squares — highest terminal contrast",
    cell: (i) => ["\uD83D\uDFE8", "\uD83D\uDFE7", "\uD83D\uDFEB", "\uD83D\uDFE5", "\u2B1B"][i],
    today: () => "\uD83D\uDD25",  // 🔥
    legend: () => ["\uD83D\uDFE8", "\uD83D\uDFE7", "\uD83D\uDFEB", "\uD83D\uDFE5", "\u2B1B"],
  },
  pollution: {
    describe: "Pollution progression: 💨 → 🌫 → 🏭 → 🔥 → ☠",
    cell: (i) => ["\uD83D\uDCA8", "\uD83C\uDF2B\uFE0F", "\uD83C\uDFED", "\uD83D\uDD25", "\u2620\uFE0F"][i],
    today: () => "\u2620\uFE0F",
    legend: () => ["\uD83D\uDCA8", "\uD83C\uDF2B\uFE0F", "\uD83C\uDFED", "\uD83D\uDD25", "\u2620\uFE0F"],
  },
};

function themeCell(style: StyleDef, intensity: number): string {
  return style.cell(intensity);
}
function themeToday(style: StyleDef): string {
  return style.today();
}
function themeEmpty(): string {
  return " ".repeat(EMOJI_CELL_W);
}

// Plain ASCII heatmap (pre-emoji fallback) — single ● per cell.
function sootChar(intensity: number): string {
  const [r, g, b] = SOOT_RGB[intensity];
  return chalk.rgb(r, g, b).bold("\u25CF");
}
function todayChar(): string {
  const [r, g, b] = RUST_TODAY;
  return chalk.rgb(r, g, b).bold("\u25C9");
}

function bucketIntensity(kg: number, maxKg: number): number {
  if (kg <= 0) return -1;
  const ratio = Math.log10(kg + 1) / Math.log10(maxKg + 1);
  return Math.min(4, Math.max(0, Math.round(ratio * 4)));
}

/**
 * Generate a realistic demo calendar: 52 weeks with activity spread
 * across all 5 intensity levels, weekday-heavy, occasional spikes,
 * some vacation gaps. Seeded PRNG → deterministic output each run.
 */
function buildDemoYear(): { days: DashboardDay[]; totalKg: number; sessionCount: number } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const startBack = 52 * 7;
  const start = new Date(now);
  start.setDate(start.getDate() - startBack);
  while (((start.getDay() + 6) % 7) !== 0) start.setDate(start.getDate() - 1);

  let seed = 424242;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const days: DashboardDay[] = [];
  let totalKg = 0;
  let sessionCount = 0;

  // Pick 2 vacation stretches (1–2 weeks of zero activity)
  const vacationStarts = [Math.floor(rand() * 150) + 40, Math.floor(rand() * 100) + 220];
  const vacationLens = [7 + Math.floor(rand() * 7), 10 + Math.floor(rand() * 5)];

  for (let i = 0; i <= startBack; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (d > now) break;
    const dateStr = d.toISOString().slice(0, 10);
    const dow = (d.getDay() + 6) % 7;
    const isWeekend = dow >= 5;

    const inVacation =
      (i >= vacationStarts[0] && i < vacationStarts[0] + vacationLens[0]) ||
      (i >= vacationStarts[1] && i < vacationStarts[1] + vacationLens[1]);

    // Activity probability. Weekdays heavy, weekends sparse, ramp up slightly near present.
    const ramp = 0.8 + (i / startBack) * 0.4;
    const baseProb = isWeekend ? 0.22 : 0.82;
    const active = !inVacation && rand() < baseProb * ramp;

    let kg = 0;
    if (active) {
      // Spread across 5 intensity tiers so the legend is fully
      // populated in the rendering. Weighted lighter overall.
      const r = rand();
      if (r < 0.30) kg = 1 + rand() * 6;          // L0 (light)
      else if (r < 0.58) kg = 6 + rand() * 18;    // L1
      else if (r < 0.82) kg = 22 + rand() * 30;   // L2
      else if (r < 0.95) kg = 50 + rand() * 40;   // L3
      else kg = 90 + rand() * 120;                // L4 (extreme)
    }

    const sessions = kg > 0 ? Math.max(1, Math.round(kg / 10)) : 0;
    totalKg += kg;
    sessionCount += sessions;

    days.push({
      date: dateStr,
      kg: Math.round(kg * 10) / 10,
      sessions,
      dayOfWeek: dow,
      isToday: dateStr === todayStr,
    });
  }

  return { days, totalKg, sessionCount };
}

function buildYearCalendar(sessions: DetailedSession[]): DashboardDay[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const startBack = 52 * 7;
  const start = new Date(now);
  start.setDate(start.getDate() - startBack);
  while (((start.getDay() + 6) % 7) !== 0) {
    start.setDate(start.getDate() - 1);
  }

  const days: DashboardDay[] = [];
  for (let i = 0; i <= startBack; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (d > now) break;
    const dateStr = d.toISOString().slice(0, 10);
    const dayEntries = sessions.filter((s) => s.last_activity.slice(0, 10) === dateStr);
    const kg = dayEntries.reduce((s, e) => s + e.co2_grams, 0) / 1000;
    days.push({
      date: dateStr,
      kg,
      sessions: dayEntries.length,
      dayOfWeek: (d.getDay() + 6) % 7,
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

// ── Terminal detection ────────────────────────────────────

type ImageCapability = "iterm2" | "kitty" | "none";

function detectImageCapability(): ImageCapability {
  const termProgram = process.env.TERM_PROGRAM ?? "";
  const term = process.env.TERM ?? "";
  const lcTerm = process.env.LC_TERMINAL ?? "";

  // iTerm2, WezTerm (supports iTerm2 protocol), Mintty/Tabby on macOS
  if (
    termProgram === "iTerm.app" ||
    termProgram === "WezTerm" ||
    lcTerm === "iTerm2"
  ) {
    return "iterm2";
  }
  // Kitty's own graphics protocol
  if (term.includes("kitty") || termProgram === "kitty") {
    return "kitty";
  }
  return "none";
}

// ── Image rendering ───────────────────────────────────────

function svgToPng(svg: string, widthPx: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
    background: "#f7f5f0",
    // loadSystemFonts: true — required for month + day-of-week labels.
    // Without it, resvg ships no default font and every <text> element
    // disappears from the rendered PNG.
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "Helvetica",
    },
  });
  return resvg.render().asPng();
}

/**
 * iTerm2 / WezTerm inline image protocol.
 * Spec: https://iterm2.com/documentation-images.html
 */
function iterm2Image(pngBytes: Buffer): string {
  const b64 = pngBytes.toString("base64");
  // ESC ] 1337 ; File = inline=1 ; ... : BASE64 BEL
  return `\x1b]1337;File=inline=1;preserveAspectRatio=1:${b64}\x07`;
}

/**
 * Kitty graphics protocol — chunked base64 with control keys.
 * Spec: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */
function kittyImage(pngBytes: Buffer): string {
  const b64 = pngBytes.toString("base64");
  const CHUNK = 4096;
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) {
    const chunk = b64.slice(i, i + CHUNK);
    const more = i + CHUNK < b64.length ? 1 : 0;
    const keys = i === 0 ? `a=T,f=100,m=${more}` : `m=${more}`;
    out.push(`\x1b_G${keys};${chunk}\x1b\\`);
  }
  return out.join("");
}

// ── Emoji render (default) ────────────────────────────────

function renderEmoji(
  days: DashboardDay[],
  totalKg: number,
  sessionCount: number,
  scopeLabel: string,
  styleName: Style,
): void {
  const style = STYLES[styleName];
  if (days.length === 0) {
    console.log(colors.dim("  No footprint data for this scope."));
    return;
  }

  const weeks: (DashboardDay | null)[][] = [];
  let wk: (DashboardDay | null)[] = new Array(7).fill(null);
  for (const day of days) {
    wk[day.dayOfWeek] = day;
    if (day.dayOfWeek === 6) {
      weeks.push(wk);
      wk = new Array(7).fill(null);
    }
  }
  if (wk.some((x) => x !== null)) weeks.push(wk);

  const maxKg = Math.max(0.001, ...days.map((d) => d.kg));

  // Month label row — stride is 2 chars per week to match emoji width.
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthRow: string[] = [];
  let prevMonth = -1;
  let skipLeft = 0;
  weeks.forEach((week) => {
    if (skipLeft > 0) { skipLeft--; return; }
    const firstDay = week.find((d): d is DashboardDay => d !== null);
    const m = firstDay ? new Date(firstDay.date).getMonth() : -1;
    if (m !== -1 && m !== prevMonth) {
      const lbl = MON[m].padEnd(2 * 2, " ");
      monthRow.push(lbl);
      skipLeft = 1; // label takes ~2 week-columns of visual space
      prevMonth = m;
    } else {
      monthRow.push("  ");
    }
  });

  console.log("");
  console.log(sectionHeader(
    "CARBON FOOTPRINT",
    `last year · ${scopeLabel} · ~${totalKg.toFixed(1)} kg · ${sessionCount} sessions`,
  ));
  console.log("");

  // Gutter: 5 chars left (label col + 1 space)
  const GUTTER = " ".repeat(5);
  console.log(GUTTER + colors.dim(monthRow.join("")));

  const DOW_LABELS = ["Mon", "   ", "Wed", "   ", "Fri", "   ", "   "];
  for (let r = 0; r < 7; r++) {
    const cells = weeks.map((week) => {
      const day = week[r];
      if (!day) return "  ";
      if (day.isToday) return themeToday(style);
      if (day.kg <= 0) return themeEmpty();
      return themeCell(style, bucketIntensity(day.kg, maxKg));
    }).join("");
    console.log(`  ${colors.dim(DOW_LABELS[r])} ` + cells);
  }

  console.log("");
  const legend = style.legend().join("");
  console.log(
    `     ${colors.dim("lighter")}  ${legend}  ${colors.dim("darker")}   ` +
    colors.dim(`${styleName} style · 1 cell = 1 day`),
  );
  console.log("");
}

// ── ASCII heatmap fallback (pre-emoji terminals) ──────────

function renderAscii(
  days: DashboardDay[],
  totalKg: number,
  sessionCount: number,
  scopeLabel: string,
): void {
  if (days.length === 0) {
    console.log(colors.dim("  No footprint data for this scope."));
    return;
  }

  const weeks: (DashboardDay | null)[][] = [];
  let wk: (DashboardDay | null)[] = new Array(7).fill(null);
  for (const day of days) {
    wk[day.dayOfWeek] = day;
    if (day.dayOfWeek === 6) {
      weeks.push(wk);
      wk = new Array(7).fill(null);
    }
  }
  if (wk.some((x) => x !== null)) weeks.push(wk);

  const maxKg = Math.max(0.001, ...days.map((d) => d.kg));

  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthCells = new Array(weeks.length).fill(" ");
  let prevMonth = -1;
  weeks.forEach((week, col) => {
    const firstDay = week.find((d): d is DashboardDay => d !== null);
    if (!firstDay) return;
    const m = new Date(firstDay.date).getMonth();
    if (m !== prevMonth) {
      const lbl = MON[m];
      for (let i = 0; i < lbl.length && col + i < monthCells.length; i++) {
        monthCells[col + i] = lbl[i];
      }
      prevMonth = m;
    }
  });

  console.log("");
  console.log(sectionHeader(
    "CARBON FOOTPRINT",
    `last year · ${scopeLabel} · ~${totalKg.toFixed(1)} kg · ${sessionCount} sessions`,
  ));
  console.log("");

  const GUTTER = " ".repeat(6);
  console.log(GUTTER + colors.dim(monthCells.join("")));

  const DOW_LABELS = ["Mon", "   ", "Wed", "   ", "Fri", "   ", "   "];
  for (let r = 0; r < 7; r++) {
    const cells = weeks.map((week) => {
      const day = week[r];
      if (!day) return " ";
      if (day.kg <= 0) return " ";
      if (day.isToday) return todayChar();
      return sootChar(bucketIntensity(day.kg, maxKg));
    }).join("");
    console.log(`  ${colors.dim(DOW_LABELS[r])} ` + cells);
  }

  console.log("");
  const legend = [0, 1, 2, 3, 4].map((i) => sootChar(i)).join(" ");
  console.log(
    `     ${colors.dim("lighter")} ${legend} ${colors.dim("darker")}   ` +
    colors.dim("each dot = 1 day · blank = no trace left"),
  );
  console.log("");
}

// ── Image path ────────────────────────────────────────────

function renderImage(
  days: DashboardDay[],
  totalKg: number,
  sessionCount: number,
  scopeLabel: string,
  capability: ImageCapability,
): void {
  console.log("");
  console.log(sectionHeader(
    "CARBON FOOTPRINT",
    `last year · ${scopeLabel} · ~${totalKg.toFixed(1)} kg · ${sessionCount} sessions`,
  ));
  console.log("");

  const svg = renderCalendarSVG(days, totalKg, sessionCount, "full");
  if (!svg) {
    console.log(colors.dim("  (no calendar data)"));
    return;
  }
  const png = svgToPng(svg, 900);
  const inline = capability === "kitty" ? kittyImage(png) : iterm2Image(png);
  process.stdout.write("  " + inline + "\n\n");
}

// ── Main command ──────────────────────────────────────────

export async function footprintCommand(options: {
  all?: boolean;
  image?: boolean;
  ascii?: boolean;
  style?: string;
  demo?: boolean;
} = {}): Promise<void> {
  const style: Style = ((): Style => {
    const s = (options.style ?? "footprint").toLowerCase();
    if (s in STYLES) return s as Style;
    console.log(colors.red(`  Unknown style: "${s}"`));
    console.log(colors.dim(`  Valid: ${Object.keys(STYLES).join(" · ")}`));
    process.exit(1);
  })();
  let days: DashboardDay[];
  let totalKg: number;
  let scopeLabel: string;
  let sessionCount: number;

  if (options.demo) {
    // Spread-out sample data that exercises the full intensity ramp.
    const demo = buildDemoYear();
    days = demo.days;
    totalKg = demo.totalKg;
    sessionCount = demo.sessionCount;
    scopeLabel = "demo · 52 weeks · all levels 0-4";
  } else {
    const { config } = createContext();
    const projectPath = process.cwd();
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 365);

    const sessions = options.all
      ? collectAllSessions(from, now, config.region)
      : collectProjectSessions(projectPath, from, now, config.region);

    if (sessions.length === 0) {
      console.log("");
      if (options.all) {
        console.log(colors.dim("  No sessions in the last year."));
      } else {
        console.log(colors.dim("  No sessions for this project in the last year."));
        console.log(colors.dim("  Try  co2de footprint --all  for every project."));
      }
      console.log(colors.dim("  Or  co2de footprint --demo  to see a filled example."));
      console.log("");
      return;
    }

    totalKg = sessions.reduce((s, x) => s + x.co2_grams, 0) / 1000;
    scopeLabel = options.all ? "all projects" : (sessions[0]?.project ?? "project");
    sessionCount = sessions.length;
    days = buildYearCalendar(sessions);
  }

  // Mode resolution:
  //   --image  → force inline PNG (iTerm2/WezTerm/Kitty)
  //   --ascii  → force plain ● heatmap
  //   default  → 👣 emoji with soot backgrounds (creative, readable,
  //              works on any modern terminal with emoji support)
  if (options.image) {
    const auto = detectImageCapability();
    const capability = auto === "none" ? "iterm2" : auto;
    try {
      renderImage(days, totalKg, sessionCount, scopeLabel, capability);
      return;
    } catch (err) {
      console.log(colors.dim(
        `  (inline image failed: ${err instanceof Error ? err.message : String(err)} — falling back to emoji)`,
      ));
    }
  }
  if (options.ascii) {
    renderAscii(days, totalKg, sessionCount, scopeLabel);
    return;
  }
  renderEmoji(days, totalKg, sessionCount, scopeLabel, style);
}
