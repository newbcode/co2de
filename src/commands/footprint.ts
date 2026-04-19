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

// Warm bronze → rust ramp, calibrated for dark-terminal visibility.
const SOOT_RGB: [number, number, number][] = [
  [164, 146, 120],
  [139, 115, 82],
  [112, 79, 53],
  [82, 50, 32],
  [201, 69, 31],
];
const RUST_TODAY: [number, number, number] = [215, 90, 40];

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
    font: { loadSystemFonts: false },
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

// ── ASCII heatmap fallback ────────────────────────────────

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
} = {}): Promise<void> {
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
    console.log("");
    return;
  }

  const totalKg = sessions.reduce((s, x) => s + x.co2_grams, 0) / 1000;
  const scopeLabel = options.all ? "all projects" : (sessions[0]?.project ?? "project");
  const days = buildYearCalendar(sessions);

  // Mode resolution: explicit flag wins, otherwise auto-detect terminal.
  const auto = detectImageCapability();
  const wantImage = options.image || (!options.ascii && auto !== "none");
  const capability = options.image && auto === "none" ? "iterm2" : auto;

  if (wantImage) {
    try {
      renderImage(days, totalKg, sessions.length, scopeLabel, capability);
      return;
    } catch (err) {
      console.log(colors.dim(
        `  (inline image failed: ${err instanceof Error ? err.message : String(err)} — falling back to ASCII)`,
      ));
    }
  }
  renderAscii(days, totalKg, sessions.length, scopeLabel);
}
