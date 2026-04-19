import type { DashboardDay } from "../dashboard/data.js";

/**
 * Privacy-aware static Calendar SVG for public README embedding.
 *
 *   full      daily cells, exact kg in <title> tooltip (hover in some renderers)
 *   bucketed  daily cells, 5-level color bucket only, no titles (default)
 *   weekly    weekly aggregate, 1 row × 53 cells
 *   disclosed skip calendar entirely — returns null
 *
 * No JavaScript, no animations. GitHub's markdown renderer strips JS
 * from SVGs, and we want the file embeddable anywhere.
 */

export type PrivacyLevel = "full" | "bucketed" | "weekly" | "disclosed";

const SOOT = ['#c0b6a2', '#8a7a65', '#4d3f30', '#231810', '#8b3a1a'];
const EMPTY_CELL_FILL = "rgba(58,51,44,0.04)";
const PAPER = "#f7f5f0";
const INK_SOFT = "#8b7f74";
const RUST = "#8b4a2b";

const CELL = 11;
const GAP = 2;
const COL_W = CELL + GAP;
const MARGIN_LEFT = 30;
const MARGIN_TOP = 18;
const MARGIN_BOTTOM = 28;   // legend + footer

interface BuildWeeksResult {
  weeks: (DashboardDay | null)[][];
  monthLabels: { col: number; label: string }[];
}

function buildWeeks(calendar: DashboardDay[]): BuildWeeksResult {
  const weeks: (DashboardDay | null)[][] = [];
  let wk: (DashboardDay | null)[] = new Array(7).fill(null);
  for (const day of calendar) {
    wk[day.dayOfWeek] = day;
    if (day.dayOfWeek === 6) {
      weeks.push(wk);
      wk = new Array(7).fill(null);
    }
  }
  if (wk.some((x) => x !== null)) weeks.push(wk);

  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthLabels: { col: number; label: string }[] = [];
  let prevMonth = -1;
  weeks.forEach((week, col) => {
    const firstDay = week.find((d): d is NonNullable<typeof d> => d !== null);
    if (!firstDay) return;
    const m = new Date(firstDay.date).getMonth();
    if (m !== prevMonth) {
      monthLabels.push({ col, label: MON[m] });
      prevMonth = m;
    }
  });

  return { weeks, monthLabels };
}

function intensity(kg: number, maxKg: number): number {
  const ratio = Math.log10(kg + 1) / Math.log10(maxKg + 1);
  return Math.min(4, Math.max(0, Math.round(ratio * 4)));
}

/** Compact footprint inside a cell — two tiny ovals. */
function footprintSvgInline(idx: number, tilt: number, x: number, y: number): string {
  const fill = SOOT[idx];
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  return `<g transform="rotate(${tilt} ${cx} ${cy})" fill="${fill}"><ellipse cx="${cx}" cy="${cy + 2.5}" rx="3.2" ry="3.8"/><ellipse cx="${cx + 0.8}" cy="${cy - 3}" rx="2.2" ry="2"/></g>`;
}

/** Weekly-aggregated privacy variant — 53 rounded cells in a single row. */
function renderWeeklySVG(calendar: DashboardDay[], totalKg: number, sessions: number): string {
  const { weeks } = buildWeeks(calendar);
  const weekSums = weeks.map((wk) =>
    wk.reduce((s, d) => s + (d?.kg ?? 0), 0),
  );
  const maxWk = Math.max(0.001, ...weekSums);
  const height = 50;
  const width = MARGIN_LEFT + weeks.length * COL_W;

  const cells = weekSums.map((kg, col) => {
    const x = MARGIN_LEFT + col * COL_W;
    const y = 10;
    if (kg <= 0) {
      return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${EMPTY_CELL_FILL}"/>`;
    }
    const idx = intensity(kg, maxWk);
    return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${SOOT[idx]}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="co2de carbon footprint · weekly">
  <rect width="100%" height="100%" fill="${PAPER}"/>
  <text x="0" y="14" font-family="Iowan Old Style,Georgia,serif" font-size="14" fill="#1a1611">~${totalKg.toFixed(1)} kg · ${sessions} sessions · weekly aggregate</text>
  ${cells}
  <text x="${width - 4}" y="${height - 4}" text-anchor="end" font-family="Verdana,sans-serif" font-size="9" fill="${INK_SOFT}">52 weeks · co2de</text>
</svg>`;
}

/**
 * Render the full/bucketed SVG calendar. `full` adds <title> tooltips.
 * `bucketed` strips them — same cells, less information disclosed.
 */
export function renderCalendarSVG(
  calendar: DashboardDay[],
  totalKg: number,
  sessions: number,
  privacy: PrivacyLevel,
): string | null {
  if (privacy === "disclosed") return null;
  if (privacy === "weekly") return renderWeeklySVG(calendar, totalKg, sessions);

  const { weeks, monthLabels } = buildWeeks(calendar);
  const maxKg = Math.max(0.001, ...calendar.map((d) => d.kg));
  const width = MARGIN_LEFT + weeks.length * COL_W + 8;
  const height = MARGIN_TOP + 7 * COL_W + MARGIN_BOTTOM;

  // Month labels
  const monthsSvg = monthLabels
    .map((m) => {
      const x = MARGIN_LEFT + m.col * COL_W;
      return `<text x="${x}" y="12" font-family="Verdana,sans-serif" font-size="9" fill="${INK_SOFT}">${m.label}</text>`;
    })
    .join("");

  // Day-of-week labels (Mon / Wed / Fri)
  const dayLabels = [
    { y: 1, text: "" },
    { y: 2, text: "Mon" },
    { y: 3, text: "" },
    { y: 4, text: "Wed" },
    { y: 5, text: "" },
    { y: 6, text: "Fri" },
    { y: 7, text: "" },
  ];
  const dowSvg = dayLabels
    .filter((d) => d.text)
    .map((d) => {
      const y = MARGIN_TOP + (d.y - 1) * COL_W + 9;
      return `<text x="0" y="${y}" font-family="Verdana,sans-serif" font-size="9" fill="${INK_SOFT}">${d.text}</text>`;
    })
    .join("");

  // Cells
  let cellsSvg = "";
  weeks.forEach((week, col) => {
    for (let r = 0; r < 7; r++) {
      const x = MARGIN_LEFT + col * COL_W;
      const y = MARGIN_TOP + r * COL_W;
      const day = week[r];
      if (!day) {
        // Before calendar start or after today — invisible
        continue;
      }
      // Empty-activity cell: faint background
      cellsSvg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${EMPTY_CELL_FILL}"/>`;
      if (day.kg <= 0) continue;
      const idx = intensity(day.kg, maxKg);
      const tilt = r % 2 === 0 ? -10 : 10;
      cellsSvg += footprintSvgInline(idx, tilt, x, y);
      if (day.isToday) {
        cellsSvg += `<rect x="${x - 0.5}" y="${y - 0.5}" width="${CELL + 1}" height="${CELL + 1}" rx="2.5" fill="none" stroke="${RUST}" stroke-width="1"/>`;
      }
      if (privacy === "full") {
        cellsSvg += `<title>${day.date} · ${day.kg.toFixed(2)} kg · ${day.sessions} session${day.sessions === 1 ? "" : "s"}</title>`;
      }
    }
  });

  // Legend bottom right — 5 footprints
  const legendY = MARGIN_TOP + 7 * COL_W + 14;
  const legendLabelX = width - 165;
  const legendFeetStart = legendLabelX + 48;
  const legendFeet = [0, 1, 2, 3, 4]
    .map((i) => footprintSvgInline(i, -10, legendFeetStart + i * COL_W, legendY - COL_W / 2 - 2))
    .join("");
  const legendFeetBgs = [0, 1, 2, 3, 4]
    .map((i) => `<rect x="${legendFeetStart + i * COL_W}" y="${legendY - COL_W / 2 - 2}" width="${CELL}" height="${CELL}" rx="2" fill="${EMPTY_CELL_FILL}"/>`)
    .join("");
  const legendSvg = `
    <text x="${legendLabelX}" y="${legendY}" font-family="Verdana,sans-serif" font-size="9" fill="${INK_SOFT}">LIGHTER</text>
    ${legendFeetBgs}${legendFeet}
    <text x="${legendFeetStart + 5 * COL_W + 6}" y="${legendY}" font-family="Verdana,sans-serif" font-size="9" fill="${INK_SOFT}">DARKER</text>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="co2de carbon footprint · 52 weeks">
  <rect width="100%" height="100%" fill="${PAPER}"/>
  ${monthsSvg}
  ${dowSvg}
  ${cellsSvg}
  ${legendSvg}
  <text x="2" y="${height - 4}" font-family="Verdana,sans-serif" font-size="9" fill="${INK_SOFT}">co2de · ~${totalKg.toFixed(1)} kg · ${sessions} sessions</text>
</svg>`;
}
