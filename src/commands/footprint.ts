import chalk from "chalk";
import { collectAllSessions, collectProjectSessions, type DetailedSession } from "../adapters/claude.js";
import { colors } from "../renderer/colors.js";
import { sectionHeader } from "../renderer/format.js";
import { createContext } from "./shared.js";

/**
 * co2de footprint — year-view GitHub-grass-style calendar in the terminal.
 *
 * Mirrors the SVG calendar used in `co2de readme` and the dashboard.
 * 7 rows (Mon-Sun) × ~53 columns (weeks). ANSI 24-bit color for the
 * soot intensity ramp (paper → rust). Single-character cells (●/·)
 * for density — fits in a 120-col terminal.
 *
 * Scope policy matches dashboard/readme: defaults to current project,
 * --all switches to global aggregation.
 */

// 24-bit soot ramp calibrated for terminal visibility.
// Pale ash is boosted to stay readable on both light/dark backgrounds;
// rust at the top gives the same "industrial scarring" signal as the SVG.
const SOOT_RGB: [number, number, number][] = [
  [156, 142, 120],  // lifted from #c0b6a2 for contrast on cream terminals
  [122, 105, 82],   // dusty brown
  [90, 70, 52],     // charcoal
  [60, 45, 35],     // deep soot
  [178, 70, 35],    // brighter rust than SVG's #8b3a1a — pops in terminal
];

function sootChar(intensity: number): string {
  const [r, g, b] = SOOT_RGB[intensity];
  return chalk.rgb(r, g, b).bold("●");
}

function emptyChar(): string {
  return chalk.rgb(100, 95, 88).dim("·");
}

function paddingChar(): string {
  return " ";
}

function bucketIntensity(kg: number, maxKg: number): number {
  if (kg <= 0) return -1;
  const ratio = Math.log10(kg + 1) / Math.log10(maxKg + 1);
  return Math.min(4, Math.max(0, Math.round(ratio * 4)));
}

interface CalendarDay {
  date: string;
  kg: number;
  dayOfWeek: number;  // 0 = Mon, 6 = Sun
  isToday: boolean;
}

function buildYearCalendar(sessions: DetailedSession[]): CalendarDay[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const startBack = 52 * 7;
  const start = new Date(now);
  start.setDate(start.getDate() - startBack);
  while (((start.getDay() + 6) % 7) !== 0) {
    start.setDate(start.getDate() - 1);
  }

  const days: CalendarDay[] = [];
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
      dayOfWeek: (d.getDay() + 6) % 7,
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

function render(days: CalendarDay[], totalKg: number, sessionCount: number, scopeLabel: string): void {
  if (days.length === 0) {
    console.log(colors.dim("  No footprint data for this scope."));
    return;
  }

  // Bucket days into weeks
  const weeks: (CalendarDay | null)[][] = [];
  let wk: (CalendarDay | null)[] = new Array(7).fill(null);
  for (const day of days) {
    wk[day.dayOfWeek] = day;
    if (day.dayOfWeek === 6) {
      weeks.push(wk);
      wk = new Array(7).fill(null);
    }
  }
  if (wk.some((x) => x !== null)) weeks.push(wk);

  const maxKg = Math.max(0.001, ...days.map((d) => d.kg));

  // Month label row — place 3-letter month at its first column
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthCells = new Array(weeks.length).fill(" ");
  let prevMonth = -1;
  weeks.forEach((week, col) => {
    const firstDay = week.find((d): d is CalendarDay => d !== null);
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
  console.log(sectionHeader("CARBON FOOTPRINT", `last year · ${scopeLabel} · ~${totalKg.toFixed(1)} kg · ${sessionCount} sessions`));
  console.log("");

  // Month header
  console.log("     " + colors.dim(monthCells.join("")));

  // Day-of-week rows (dayOfWeek: 0=Mon … 6=Sun).
  // Label Mon/Wed/Fri on their actual rows (GitHub convention).
  const DOW_LABELS = ["Mon", "   ", "Wed", "   ", "Fri", "   ", "   "];
  for (let r = 0; r < 7; r++) {
    const cells = weeks
      .map((week) => {
        const day = week[r];
        if (!day) return paddingChar();
        const idx = bucketIntensity(day.kg, maxKg);
        if (idx < 0) return emptyChar();
        const glyph = sootChar(idx);
        return day.isToday ? chalk.rgb(139, 58, 26)("◉") : glyph;
      })
      .join("");
    console.log(`  ${colors.dim(DOW_LABELS[r])} ${cells}`);
  }

  // Legend
  console.log("");
  const legend = [0, 1, 2, 3, 4].map((i) => sootChar(i)).join(" ");
  console.log(`     ${colors.dim("lighter")} ${legend} ${colors.dim("darker")}   ${colors.dim("·")} ${colors.dim("each dot = 1 day · empty = no trace left")}`);
  console.log("");
}

export async function footprintCommand(options: { all?: boolean } = {}): Promise<void> {
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

  render(days, totalKg, sessions.length, scopeLabel);
}
