import type { PracticeBadge } from "../badges/practice.js";
import type { DashboardData } from "../dashboard/data.js";
import type { PrivacyLevel } from "../badges/calendar-svg.js";
import { renderCalendarSVG } from "../badges/calendar-svg.js";
import { fmtBadgePace } from "../badges/svg.js";

/**
 * Public disclosure page — nutrition-label style.
 *
 * Intent: a repository's carbon "facts panel" that a visitor can view
 * in one glance, printed on the same industrial/forensic palette as
 * the dashboard. No score, no ranking, no celebration — just the
 * numbers + the methodology link.
 *
 * All SVGs inlined so the file is self-contained and can be hosted
 * anywhere (GitHub Pages, Netlify, or served from the repo root).
 */
export function renderDisclosureHTML(data: {
  projectName: string;
  pace: number;                     // grams/year
  practice: PracticeBadge[];
  dashData: DashboardData | null;
  privacy: PrivacyLevel;
  linesWritten: number;
  region: string;
}): string {
  const { projectName, pace, practice, dashData, privacy, linesWritten, region } = data;
  const today = new Date().toISOString().slice(0, 10);

  const calendarSvg = dashData
    ? renderCalendarSVG(dashData.calendar, dashData.calendarTotalKg, dashData.calendarSessions, privacy)
    : null;

  const practiceRows = practice
    .map((p) => {
      const mark = p.qualifies
        ? `<span class="tick">●</span>`
        : `<span class="tick off">○</span>`;
      return `<div class="row">
        <div class="row-label">${mark} ${escapeHtml(p.label)}</div>
        <div class="row-value">${escapeHtml(p.value)}</div>
        <div class="row-note">${escapeHtml(p.note)}</div>
      </div>`;
    })
    .join("");

  const totalCO2 = dashData?.calendarTotalKg ?? 0;
  const totalSessions = dashData?.calendarSessions ?? 0;
  const avgPerSession = totalSessions > 0 ? totalCO2 / totalSessions : 0;
  const gPerLine = linesWritten > 0 ? (totalCO2 * 1000) / linesWritten : 0;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(projectName)} · carbon disclosure</title>
<style>
${STYLES}
</style>
</head>
<body>
<div class="backdrop" aria-hidden="true"></div>

<main>

<header class="top">
  <div class="brand">co2de<span>carbon disclosure</span></div>
  <div class="meta">${escapeHtml(projectName)} · region ${escapeHtml(region)} · updated ${today}</div>
</header>

<section class="panel">
  <div class="panel-head">
    <div class="label">Annual pace</div>
    <div class="hero">${escapeHtml(fmtBadgePace(pace))}</div>
    <div class="sub">Projected from the past 30 days of recorded sessions in this project.</div>
  </div>

  <div class="grid">
    <div class="stat">
      <div class="k">Last-year total</div>
      <div class="v">~${totalCO2.toFixed(1)} <small>kg CO₂e</small></div>
    </div>
    <div class="stat">
      <div class="k">Sessions</div>
      <div class="v">${totalSessions}</div>
    </div>
    <div class="stat">
      <div class="k">Avg / session</div>
      <div class="v">~${avgPerSession.toFixed(2)} <small>kg</small></div>
    </div>
    <div class="stat">
      <div class="k">g CO₂ / line written</div>
      <div class="v">${gPerLine > 0 ? gPerLine.toFixed(1) : "—"}</div>
    </div>
  </div>
</section>

<section class="panel">
  <h2>Practice signals</h2>
  <p class="desc">Threshold badges — not ranked. A filled dot (●) means the threshold is met; an open dot (○) means it isn't. Absence of a signal is not failure — it's information.</p>
  <div class="practice">
    ${practiceRows}
  </div>
</section>

${calendarSvg ? `
<section class="panel">
  <h2>Carbon footprint · ${privacy === "weekly" ? "52 weeks" : "daily"}</h2>
  <p class="desc">Each footprint = one day of AI-assisted development in this project. Empty cells = days with no sessions. ${privacy === "bucketed" ? "Intensities are bucketed (5 levels) — exact daily kg is not disclosed." : ""} ${privacy === "weekly" ? "Displayed as weekly aggregates — daily patterns are not disclosed." : ""} ${privacy === "full" ? "Full daily intensities are shown." : ""}</p>
  <div class="calendar-wrap">
${calendarSvg}
  </div>
</section>
` : ""}

<section class="panel methodology">
  <h2>How this is measured</h2>
  <p>co2de reads Claude Code JSONL session files locally and computes Scope 2 inference-only emissions:</p>
  <ol>
    <li><b>Tokens → energy:</b> per-model Wh/token coefficient × PUE (1.2)</li>
    <li><b>Energy → CO₂:</b> × regional grid carbon intensity (gCO₂/kWh)</li>
    <li><b>Cache reads:</b> billed at 10% energy (pricing-proxy assumption)</li>
  </ol>
  <p class="caveat">
    <b>All values are order-of-magnitude estimates.</b> Token count explains only ~44% of actual inference energy variance (Mamun et al. 2026). Training, hardware manufacturing, and network transmission are <b>excluded</b>. This is an awareness tool, not a compliance tool.
  </p>
  <p class="caveat">
    <b>The region setting is hypothetical.</b> Anthropic runs inference in US-based datacenters regardless of your configured region. Setting the region changes the display only.
  </p>
</section>

<section class="panel principles">
  <h2>Why disclosure, not ranking</h2>
  <ul>
    <li>Apples-to-apples ranking across languages, stacks, and project scopes is not possible.</li>
    <li>Any single "score" would be game-able — splitting commits, bloating code, moving work outside the agent.</li>
    <li>Normative scoring invites misuse (employers judging individuals).</li>
    <li>The virtue of this movement is <b>publishing the facts</b>, not winning a number.</li>
  </ul>
  <p class="caveat">
    Tips for reducing emissions without changing model or productivity:
    <a href="https://github.com/newbcode/co2de#co2de-tips">co2de tips</a> · same model, fewer wasted tokens.
  </p>
</section>

<footer class="bottom">
  <span>co2de · methodology v1.0 · Mamun 2026 · IEA 2023</span>
  <span>${today}</span>
</footer>

</main>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLES = `
:root {
  --paper:    #f7f5f0;
  --surface:  #ffffff;
  --ink-deep: #1a1611;
  --ink-mid:  #5a544b;
  --ink-soft: #8b7f74;
  --line:     #d9d4c9;
  --line-soft:#e8e4d9;
  --rust:     #8b4a2b;
  --serif: "Iowan Old Style","Palatino","Georgia","EB Garamond",serif;
  --mono:  "SF Mono","JetBrains Mono","Menlo","Consolas",monospace;
  --sans:  -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: var(--paper); color: var(--ink-deep); font-family: var(--sans); font-size: 14px; line-height: 1.5; min-height: 100vh; position: relative; }
.backdrop {
  position: fixed; inset: 0; z-index: -1;
  background-color: var(--paper);
  background-image:
    radial-gradient(circle, rgba(58,51,44,0.09) 1px, transparent 1px),
    radial-gradient(circle, rgba(58,51,44,0.06) 1px, transparent 1px);
  background-size: 18px 18px, 36px 36px;
  background-position: 0 0, 9px 9px;
}
main { max-width: 780px; margin: 0 auto; padding: 48px 28px 96px; }

header.top {
  display: flex; align-items: baseline; justify-content: space-between;
  border-bottom: 1px solid var(--line);
  padding-bottom: 14px; margin-bottom: 40px;
}
header.top .brand { font-family: var(--serif); font-size: 22px; letter-spacing: -0.01em; }
header.top .brand span {
  font-family: var(--mono); font-size: 12px; color: var(--ink-soft);
  letter-spacing: 0.04em; margin-left: 12px; text-transform: uppercase;
}
header.top .meta { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); letter-spacing: 0.06em; text-transform: uppercase; }

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 28px 32px;
  margin-bottom: 20px;
}
.panel h2 {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--ink-soft);
  margin: 0 0 14px; padding-bottom: 8px;
  border-bottom: 1px solid var(--line-soft);
}
.panel p, .panel .desc, .panel .caveat {
  font-size: 13.5px; line-height: 1.65; color: var(--ink-mid);
  margin: 10px 0;
}
.panel .caveat {
  font-size: 12.5px; color: var(--ink-soft);
  border-left: 2px solid var(--rust); padding-left: 14px; margin-top: 16px;
}
.panel a { color: var(--rust); text-decoration: underline; }

/* Hero pace */
.panel-head { text-align: center; margin-bottom: 28px; padding-bottom: 28px; border-bottom: 1px dashed var(--line); }
.panel-head .label {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--ink-soft); margin-bottom: 10px;
}
.panel-head .hero {
  font-family: var(--serif); font-size: 72px; letter-spacing: -0.03em;
  line-height: 0.95; color: var(--ink-deep);
}
.panel-head .sub { font-size: 12.5px; color: var(--ink-soft); margin-top: 14px; }

/* Stats grid */
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.stat { text-align: left; }
.stat .k { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 6px; }
.stat .v { font-family: var(--serif); font-size: 24px; color: var(--ink-deep); letter-spacing: -0.01em; line-height: 1.1; }
.stat .v small { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); }

/* Practice rows */
.practice { margin-top: 14px; }
.practice .row {
  display: grid; grid-template-columns: 180px 140px 1fr;
  gap: 16px; padding: 14px 0;
  border-bottom: 1px solid var(--line-soft);
  align-items: baseline;
}
.practice .row:last-child { border-bottom: none; }
.practice .row-label { font-family: var(--mono); font-size: 13px; color: var(--ink-deep); text-transform: uppercase; letter-spacing: 0.04em; }
.practice .tick { color: var(--rust); font-size: 15px; margin-right: 4px; }
.practice .tick.off { color: var(--ink-soft); }
.practice .row-value { font-family: var(--mono); font-size: 13px; color: var(--ink-deep); }
.practice .row-note { font-size: 12.5px; color: var(--ink-soft); line-height: 1.5; }

/* Calendar */
.calendar-wrap { margin: 16px 0; display: flex; justify-content: center; }
.calendar-wrap svg { max-width: 100%; height: auto; }

/* Methodology list */
.methodology ol { padding-left: 18px; line-height: 1.7; font-size: 13.5px; color: var(--ink-mid); }
.methodology ol li { margin: 4px 0; }

/* Principles list */
.principles ul { padding-left: 18px; line-height: 1.7; font-size: 13.5px; color: var(--ink-mid); }
.principles ul li { margin: 6px 0; }

footer.bottom {
  margin-top: 40px; padding-top: 20px;
  border-top: 1px solid var(--line);
  display: flex; justify-content: space-between;
  font-family: var(--mono); font-size: 10px;
  color: var(--ink-soft); letter-spacing: 0.08em; text-transform: uppercase;
}

@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr 1fr; }
  .practice .row { grid-template-columns: 1fr; gap: 4px; }
  .panel-head .hero { font-size: 52px; }
}
`;
