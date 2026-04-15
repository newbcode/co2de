import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReportData } from "../core/types.js";
import { fmtCO2, fmtTokens } from "../renderer/format.js";
import { getEnergyPerToken, resolveModelFamily } from "../engine/carbon-calculator.js";
import { CARBON_INTENSITY_GCO2_PER_KWH, ENERGY_PER_TOKEN_WH, PUE } from "../core/constants.js";

// ─── Helpers ──────────────────────────────────────────────

/** Alias for backward compatibility within this file */
const formatTokens = fmtTokens;

function formatDistance(meters: number): string {
  if (meters < 1) return `${(meters * 100).toFixed(1)} cm`;
  if (meters < 1000) return `${meters.toFixed(1)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "claude-opus": "Opus",
  "claude-sonnet": "Sonnet",
  "claude-haiku": "Haiku",
  "gemini-pro": "Gemini Pro",
  "gemini-flash": "Gemini Flash",
};

function shortModel(model: string): string {
  return MODEL_DISPLAY_NAMES[resolveModelFamily(model)] ?? (model.length > 15 ? model.slice(0, 15) : model);
}

const MODEL_COLORS = ["#bf5af2", "#64d2ff", "#ffb366", "#ff6b6b", "#8B5CF6", "#F59E0B", "#3B82F6"];

// ─── ESG Detail Report (light theme, --detail) ──────────

function generateDetailReport(data: ReportData, outputDir: string): string {
  const region = data.config.region;
  const intensity = CARBON_INTENSITY_GCO2_PER_KWH[region] ?? CARBON_INTENSITY_GCO2_PER_KWH["global"];
  const totalCost = data.sessions.reduce((s, sess) => s + sess.cost_usd, 0);

  // Period
  const sorted = [...data.sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const periodStart = sorted.length > 0 ? sorted[0].timestamp.slice(0, 10) : "";
  const periodEnd = sorted.length > 0 ? sorted[sorted.length - 1].timestamp.slice(0, 10) : "";
  const uniqueDays = new Set(data.sessions.map(s => s.timestamp.slice(0, 10)));
  const activeDays = uniqueDays.size;

  // Daily aggregation
  const dayMap = new Map<string, { tokens: number; co2: number }>();
  for (const s of data.sessions) {
    const date = s.timestamp.slice(0, 10);
    const existing = dayMap.get(date) ?? { tokens: 0, co2: 0 };
    existing.co2 += s.co2_grams;
    existing.tokens += s.total_tokens;
    dayMap.set(date, existing);
  }
  const dailyData = Array.from(dayMap.entries())
    .map(([date, d]) => ({ date, tokens: d.tokens, co2: d.co2 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Model breakdown
  const modelMap = new Map<string, { co2: number; tokens: number; sessions: number }>();
  for (const s of data.sessions) {
    const key = shortModel(s.model);
    const existing = modelMap.get(key) ?? { co2: 0, tokens: 0, sessions: 0 };
    existing.co2 += s.co2_grams;
    existing.tokens += s.total_tokens;
    existing.sessions++;
    modelMap.set(key, existing);
  }
  const models = Array.from(modelMap.entries())
    .map(([name, d], i) => ({ name, ...d, color: DETAIL_COLORS[i % DETAIL_COLORS.length] }))
    .sort((a, b) => b.co2 - a.co2);
  const modelTotalCO2 = models.reduce((s, mm) => s + mm.co2, 0) || 1;

  // Equivalents
  const m = data.metaphors;
  const treeSeconds = m.tree_absorption_seconds;
  const treeFmt = treeSeconds >= 3600
    ? `${(treeSeconds / 3600).toFixed(1)} hrs`
    : treeSeconds >= 60 ? `${(treeSeconds / 60).toFixed(1)} min` : `${treeSeconds.toFixed(0)} sec`;
  const carKm = formatDistance(m.car_drive_meters);
  const phoneCharges = Math.round(m.phone_charges);
  const googleSearches = Math.round(m.google_searches);
  const netflixMins = (m.netflix_streaming_seconds / 60).toFixed(1);
  const ledHours = m.led_bulb_hours.toFixed(1);

  // Savings
  const sv = data.savings;
  const savedPct = sv.worst_case_co2_grams > 0
    ? ((sv.saved_co2_grams / sv.worst_case_co2_grams) * 100).toFixed(1) : "0.0";
  const actualPct = sv.worst_case_co2_grams > 0
    ? ((sv.actual_co2_grams / sv.worst_case_co2_grams) * 100).toFixed(0) : "100";

  // Sessions sorted
  const sessionsSorted = [...data.sessions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // --- SVG Icons ---
  const svgTree = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M20 4L8 20h6l-4 8h6l-3 8h14l-3-8h6l-4-8h6L20 4z" fill="#78350F" opacity="0.7"/><rect x="18" y="32" width="4" height="4" rx="1" fill="#78350F"/></svg>`;
  const svgCar = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="6" y="18" width="28" height="10" rx="3" fill="#78350F" opacity="0.7"/><rect x="10" y="12" width="20" height="8" rx="2" fill="#78350F" opacity="0.5"/><circle cx="13" cy="30" r="3" fill="#78350F"/><circle cx="27" cy="30" r="3" fill="#78350F"/></svg>`;
  const svgPhone = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="12" y="4" width="16" height="32" rx="3" stroke="#78350F" stroke-width="2" opacity="0.7"/><rect x="14" y="8" width="12" height="20" rx="1" fill="#78350F" opacity="0.2"/><circle cx="20" cy="32" r="1.5" fill="#78350F" opacity="0.7"/></svg>`;
  const svgSearch = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="18" cy="18" r="10" stroke="#78350F" stroke-width="2.5" opacity="0.7"/><line x1="25" y1="25" x2="34" y2="34" stroke="#78350F" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/></svg>`;
  const svgTV = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="4" y="8" width="32" height="22" rx="3" stroke="#78350F" stroke-width="2" opacity="0.7"/><polygon points="17,14 17,24 26,19" fill="#78350F" opacity="0.5"/><line x1="14" y1="34" x2="26" y2="34" stroke="#78350F" stroke-width="2" stroke-linecap="round" opacity="0.7"/></svg>`;
  const svgLED = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="16" rx="10" ry="12" fill="#78350F" opacity="0.2"/><path d="M14 24h12v4c0 2-2 4-6 4s-6-2-6-4v-4z" fill="#78350F" opacity="0.5"/><line x1="20" y1="4" x2="20" y2="2" stroke="#B45309" stroke-width="1.5" stroke-linecap="round"/><line x1="28" y1="8" x2="30" y2="6" stroke="#B45309" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="8" x2="10" y2="6" stroke="#B45309" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  // --- SVG Timeline Chart ---
  const chartW = 880;
  const chartH = 200;
  const chartPadL = 50;
  const chartPadR = 20;
  const chartPadT = 20;
  const chartPadB = 40;
  const barAreaW = chartW - chartPadL - chartPadR;
  const barAreaH = chartH - chartPadT - chartPadB;
  const maxCO2 = dailyData.length > 0 ? Math.max(...dailyData.map(d => d.co2)) : 1;
  const niceMax = Math.ceil(maxCO2 / 10) * 10 || 10;
  const barW = dailyData.length > 0 ? Math.max(Math.min(barAreaW / dailyData.length - 2, 40), 4) : 20;
  const barGap = dailyData.length > 0 ? (barAreaW - barW * dailyData.length) / Math.max(dailyData.length - 1, 1) : 0;

  // Gridlines
  const gridSteps = 4;
  let gridLines = "";
  for (let i = 0; i <= gridSteps; i++) {
    const y = chartPadT + barAreaH - (barAreaH * i) / gridSteps;
    const val = ((niceMax * i) / gridSteps).toFixed(0);
    gridLines += `<line x1="${chartPadL}" y1="${y}" x2="${chartW - chartPadR}" y2="${y}" stroke="#E5E7EB" stroke-width="1"/>`;
    gridLines += `<text x="${chartPadL - 8}" y="${y + 4}" text-anchor="end" fill="#9CA3AF" font-size="11" font-family="system-ui">${val}g</text>`;
  }

  // Bars
  let bars = "";
  dailyData.forEach((d, i) => {
    const x = chartPadL + i * (barW + barGap);
    const h = (d.co2 / niceMax) * barAreaH;
    const y = chartPadT + barAreaH - h;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="#B45309" opacity="0.75"><title>${d.date}: ~${d.co2.toFixed(1)}g CO2</title></rect>`;
    bars += `<text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" fill="#78350F" font-size="9" font-family="system-ui">${d.co2 >= 1 ? "~" + d.co2.toFixed(1) : ""}</text>`;
    // Date label (show every Nth to avoid overlap)
    const showLabel = dailyData.length <= 14 || i % Math.ceil(dailyData.length / 14) === 0;
    if (showLabel) {
      bars += `<text x="${x + barW / 2}" y="${chartH - 8}" text-anchor="middle" fill="#9CA3AF" font-size="10" font-family="system-ui">${d.date.slice(5)}</text>`;
    }
  });

  const timelineSVG = `<svg viewBox="0 0 ${chartW} ${chartH}" width="100%" height="${chartH}" xmlns="http://www.w3.org/2000/svg" style="display:block">${gridLines}${bars}</svg>`;

  // --- Model proportional bar ---
  let modelBarSegments = "";
  let modelBarOffset = 0;
  models.forEach(mm => {
    const pct = (mm.co2 / modelTotalCO2) * 100;
    modelBarSegments += `<div style="width:${pct}%;background:${mm.color};height:100%;display:inline-block" title="${mm.name}: ${pct.toFixed(1)}%"></div>`;
    modelBarOffset += pct;
  });

  const modelTableRows = models.map(mm => {
    const pct = ((mm.co2 / modelTotalCO2) * 100).toFixed(1);
    const energyRate = getEnergyPerToken(mm.name);
    return `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${mm.color};margin-right:8px;vertical-align:middle"></span>${mm.name}</td>
      <td style="text-align:right">${mm.sessions}</td>
      <td style="text-align:right">${formatTokens(mm.tokens)}</td>
      <td style="text-align:right">~${fmtCO2(mm.co2)}</td>
      <td style="text-align:right">${pct}%</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px">${energyRate} Wh</td>
    </tr>`;
  }).join("");

  // --- Session rows ---
  const visibleCount = 50;
  const sessionRows = sessionsSorted.map((s, i) => {
    const effDot = s.co2_grams < 1 ? "#22C55E" : s.co2_grams < 10 ? "#F59E0B" : "#EF4444";
    const hidden = i >= visibleCount ? ' class="session-hidden" style="display:none"' : "";
    return `<tr${hidden}>
      <td>${i + 1}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px">${s.id.slice(0, 8)}</td>
      <td>${s.timestamp.slice(0, 16).replace("T", " ")}</td>
      <td>${shortModel(s.model)}</td>
      <td style="text-align:right">${formatTokens(s.total_tokens)}</td>
      <td style="text-align:right;font-weight:600">~${fmtCO2(s.co2_grams)}</td>
      <td style="text-align:right">$${s.cost_usd.toFixed(2)}</td>
      <td style="text-align:center"><svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="${effDot}"/></svg></td>
    </tr>`;
  }).join("");

  // --- Savings breakdown ---
  const savingsBreakdownHTML = sv.savings_breakdown.length > 0
    ? sv.savings_breakdown.map(b =>
        `<div class="savings-card">
          <div class="savings-label">${b.category}</div>
          <div class="savings-desc">${b.description}</div>
          <div class="savings-val">-${fmtCO2(b.saved_grams)}</div>
        </div>`).join("")
    : `<div style="color:#6B7280;font-size:14px;padding:16px 0">No model-based savings detected.</div>`;

  // --- Methodology tables ---
  const methodModelRows = Object.entries(ENERGY_PER_TOKEN_WH)
    .filter(([k]) => k !== "default")
    .map(([name, rate]) =>
      `<tr><td>${name}</td><td style="text-align:right;font-family:'JetBrains Mono',monospace">${rate}</td></tr>`)
    .join("");

  const methodRegionRows = Object.entries(CARBON_INTENSITY_GCO2_PER_KWH)
    .sort((a, b) => a[1] - b[1])
    .map(([code, val]) =>
      `<tr${code === region ? ' class="highlight-row"' : ""}>
        <td>${code.toUpperCase()}</td>
        <td style="text-align:right;font-family:'JetBrains Mono',monospace">${val}</td>
      </tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Carbon Emissions Report — ${data.period}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#FAFAF8;--card:#FFFFFF;--border:#E5E7EB;
  --accent:#78350F;--amber:#B45309;--amber-light:#F59E0B;
  --text:#1F2937;--muted:#6B7280;--dim:#9CA3AF;
  --green:#22C55E;--red:#EF4444;
}
html{scroll-behavior:smooth}
body{
  background:var(--bg);color:var(--text);
  font-family:system-ui,'Apple SD Gothic Neo','Segoe UI',sans-serif;
  line-height:1.6;-webkit-font-smoothing:antialiased;
}
.report{max-width:960px;margin:0 auto;padding:40px 32px 60px}

/* 1. Header */
.header{
  background:linear-gradient(135deg,#FFFBEB 0%,#FDE68A 100%);
  border:1px solid #F59E0B;border-radius:12px;
  padding:40px 48px;margin-bottom:40px;
}
.header-title{font-size:28px;font-weight:700;color:var(--accent);letter-spacing:-0.5px}
.header-sub{font-size:14px;color:#92400E;margin-top:8px;line-height:1.8}
.header-meta{display:flex;gap:24px;margin-top:12px;font-size:13px;color:#92400E}
.header-meta span{display:flex;align-items:center;gap:4px}

/* Section layout */
.section{margin-bottom:36px}
.section-head{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.section-num{
  width:32px;height:32px;border-radius:50%;
  background:var(--accent);color:#FFF;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:700;flex-shrink:0;
}
.section-title{font-size:18px;font-weight:700;color:var(--accent)}

/* KPI grid */
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.kpi-card{
  background:var(--card);border:1px solid var(--border);border-radius:10px;
  padding:24px;text-align:center;
}
.kpi-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.kpi-value{font-size:32px;font-weight:800;color:var(--accent);letter-spacing:-1px}
.kpi-unit{font-size:14px;font-weight:400;color:var(--muted)}
.kpi-sub{font-size:12px;color:var(--dim);margin-top:4px}

/* Data table */
.data-table{width:100%;border-collapse:collapse;font-size:13px}
.data-table thead{background:#F9FAFB;border-bottom:2px solid var(--border)}
.data-table th{
  padding:10px 14px;text-align:left;font-size:11px;
  color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;
  cursor:pointer;user-select:none;white-space:nowrap;
}
.data-table th:hover{color:var(--accent)}
.data-table th .sort-arrow{font-size:10px;margin-left:4px;opacity:0.4}
.data-table th.sorted .sort-arrow{opacity:1;color:var(--amber)}
.data-table td{padding:10px 14px;border-bottom:1px solid #F3F4F6}
.data-table tbody tr:hover{background:#FFFBEB}
.data-table tfoot td{padding:10px 14px;font-weight:700;border-top:2px solid var(--border)}

/* Savings */
.savings-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.savings-card{
  background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;
}
.savings-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.savings-desc{font-size:13px;color:var(--text);margin-bottom:8px}
.savings-val{font-size:18px;font-weight:700;color:var(--green)}
.savings-bar-outer{
  height:16px;background:#F3F4F6;border-radius:8px;overflow:hidden;
  display:flex;margin:12px 0;
}
.savings-bar-actual{background:var(--amber);height:100%;border-radius:8px 0 0 8px}
.savings-bar-saved{background:var(--green);height:100%}

/* Equiv grid */
.equiv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.equiv-card{
  background:var(--card);border:1px solid var(--border);border-radius:10px;
  padding:24px;text-align:center;
}
.equiv-card svg{margin-bottom:8px}
.equiv-val{font-size:22px;font-weight:800;color:var(--accent);letter-spacing:-0.5px}
.equiv-desc{font-size:12px;color:var(--muted);margin-top:4px;line-height:1.4}

/* Methodology */
.method-details{
  background:var(--card);border:1px solid var(--border);border-radius:10px;
  margin-bottom:8px;
}
.method-details summary{
  padding:16px 20px;font-weight:600;font-size:14px;cursor:pointer;
  color:var(--accent);list-style:none;
}
.method-details summary::-webkit-details-marker{display:none}
.method-details summary::before{content:"+ ";font-weight:700;color:var(--amber)}
.method-details[open] summary::before{content:"- "}
.method-details .inner{padding:0 20px 20px;font-size:13px;color:var(--muted);line-height:1.7}
.formula-box{
  background:#F9FAFB;border:1px solid var(--border);border-radius:8px;
  padding:16px 20px;font-family:'JetBrains Mono',monospace;font-size:12px;
  color:var(--text);overflow-x:auto;margin:12px 0;white-space:pre;
}
.highlight-row{background:#FFFBEB !important}
.method-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
.method-table th{text-align:left;padding:8px 12px;color:var(--muted);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border)}
.method-table td{padding:8px 12px;border-bottom:1px solid #F3F4F6}
.method-table tbody tr:hover{background:#FFFBEB}

/* Show all button */
.show-all-btn{
  display:block;margin:16px auto;padding:8px 24px;
  background:var(--card);border:1px solid var(--border);border-radius:8px;
  font-size:13px;color:var(--accent);cursor:pointer;font-weight:600;
}
.show-all-btn:hover{background:#FFFBEB;border-color:var(--amber)}

/* Footer */
.footer{
  text-align:center;padding:32px 0 16px;border-top:1px solid var(--border);
  margin-top:40px;font-size:12px;color:var(--dim);line-height:1.8;
}
.footer strong{color:var(--accent);font-weight:700}

/* Print */
@media print{
  body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .report{max-width:100%;padding:20px}
  .header{break-after:avoid}
  .section{break-inside:avoid}
  .show-all-btn{display:none !important}
  .session-hidden{display:table-row !important}
  .data-table th{cursor:default}
  .equiv-card:hover,.data-table tbody tr:hover{background:transparent}
}

@media(max-width:640px){
  .report{padding:20px 16px}
  .header{padding:28px 24px}
  .kpi-grid{grid-template-columns:1fr 1fr}
  .equiv-grid{grid-template-columns:1fr 1fr}
  .savings-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="report">

  <!-- 1. Header -->
  <div class="header">
    <div class="header-title">Carbon Emissions Report</div>
    <div class="header-sub">Estimated CO2 footprint from AI-assisted development</div>
    <div class="header-meta">
      <span>Period: ${periodStart} to ${periodEnd}</span>
      <span>Generated: ${data.generatedAt.slice(0, 10)}</span>
      <span>Region: ${region.toUpperCase()}</span>
      <span>co2de v0.1.0</span>
    </div>
  </div>

  <!-- 2. Executive Summary -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">1</div>
      <div class="section-title">Executive Summary</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Estimated CO2</div>
        <div class="kpi-value">~${fmtCO2(data.totalCO2).replace(/[a-zA-Z]+$/, '')}<span class="kpi-unit">${fmtCO2(data.totalCO2).replace(/^[^a-zA-Z]+/, '')}</span></div>
        <div class="kpi-sub">gCO2 equivalent</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Energy</div>
        <div class="kpi-value">${data.totalEnergyWh.toFixed(2)}<span class="kpi-unit">Wh</span></div>
        <div class="kpi-sub">compute + PUE overhead</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sessions</div>
        <div class="kpi-value">${data.sessions.length}</div>
        <div class="kpi-sub">AI interactions</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Tokens</div>
        <div class="kpi-value">${formatTokens(data.totalTokens)}</div>
        <div class="kpi-sub">total processed</div>
      </div>
    </div>
    <div style="text-align:center;margin-top:16px;font-size:14px;color:var(--muted)">
      ${data.sessions.length} sessions across ${activeDays} active days
    </div>
  </div>

  <!-- 3. Emissions Timeline -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">2</div>
      <div class="section-title">Emissions Timeline</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;overflow-x:auto">
      ${timelineSVG}
    </div>
  </div>

  <!-- 4. Model Breakdown -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">3</div>
      <div class="section-title">Model Breakdown</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px">
      <div style="height:12px;border-radius:6px;overflow:hidden;display:flex;margin-bottom:20px">
        ${modelBarSegments}
      </div>
      <table class="data-table">
        <thead><tr>
          <th>Model</th><th style="text-align:right">Sessions</th><th style="text-align:right">Tokens</th>
          <th style="text-align:right">~CO2</th><th style="text-align:right">Share</th><th style="text-align:right">Energy Rate</th>
        </tr></thead>
        <tbody>${modelTableRows}</tbody>
      </table>
    </div>
  </div>

  <!-- 5. Efficiency & Savings -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">4</div>
      <div class="section-title">Efficiency & Savings</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:24px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
        <span style="font-size:14px;color:var(--muted)">Actual vs Worst-Case</span>
        <span style="font-size:28px;font-weight:800;color:var(--green)">${savedPct}% saved</span>
      </div>
      <div class="savings-bar-outer">
        <div class="savings-bar-actual" style="width:${actualPct}%"></div>
        <div class="savings-bar-saved" style="width:${100 - parseInt(actualPct)}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);margin-top:8px">
        <span>Actual: <strong style="color:var(--text)">~${fmtCO2(sv.actual_co2_grams)}</strong></span>
        <span>Worst-case: <strong style="color:var(--text)">~${fmtCO2(sv.worst_case_co2_grams)}</strong></span>
        <span>Saved: <strong style="color:var(--green)">${fmtCO2(sv.saved_co2_grams)}</strong></span>
      </div>
      <div style="font-size:12px;color:var(--dim);margin-top:8px">Worst-case = all tokens processed as Opus (highest energy model)</div>
    </div>
    ${sv.savings_breakdown.length > 0 ? `<div class="savings-grid">${savingsBreakdownHTML}</div>` : ""}
  </div>

  <!-- 6. Real-World Equivalents -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">5</div>
      <div class="section-title">Real-World Equivalents</div>
    </div>
    <div class="equiv-grid">
      <div class="equiv-card">${svgTree}<div class="equiv-val">${treeFmt}</div><div class="equiv-desc">tree absorption time</div></div>
      <div class="equiv-card">${svgCar}<div class="equiv-val">${carKm}</div><div class="equiv-desc">car driving distance</div></div>
      <div class="equiv-card">${svgPhone}<div class="equiv-val">${phoneCharges}</div><div class="equiv-desc">phone charges</div></div>
      <div class="equiv-card">${svgSearch}<div class="equiv-val">${googleSearches}</div><div class="equiv-desc">Google searches</div></div>
      <div class="equiv-card">${svgTV}<div class="equiv-val">${netflixMins} min</div><div class="equiv-desc">Netflix streaming</div></div>
      <div class="equiv-card">${svgLED}<div class="equiv-val">${ledHours} hrs</div><div class="equiv-desc">LED bulb runtime</div></div>
    </div>
  </div>

  <!-- 7. Session Detail -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">6</div>
      <div class="section-title">Session Detail</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <table class="data-table" id="sessionTable">
        <thead><tr>
          <th data-col="0" data-type="num"># <span class="sort-arrow">&#9650;</span></th>
          <th data-col="1" data-type="str">ID <span class="sort-arrow">&#9650;</span></th>
          <th data-col="2" data-type="str">Date <span class="sort-arrow">&#9650;</span></th>
          <th data-col="3" data-type="str">Model <span class="sort-arrow">&#9650;</span></th>
          <th data-col="4" data-type="num" style="text-align:right">Tokens <span class="sort-arrow">&#9650;</span></th>
          <th data-col="5" data-type="num" style="text-align:right">~CO2 <span class="sort-arrow">&#9650;</span></th>
          <th data-col="6" data-type="num" style="text-align:right">Cost <span class="sort-arrow">&#9650;</span></th>
          <th style="text-align:center">Eff.</th>
        </tr></thead>
        <tbody>${sessionRows}</tbody>
        <tfoot><tr>
          <td colspan="4" style="text-align:right">TOTAL</td>
          <td style="text-align:right">${formatTokens(data.totalTokens)}</td>
          <td style="text-align:right">~${fmtCO2(data.totalCO2)}</td>
          <td style="text-align:right">$${totalCost.toFixed(2)}</td>
          <td></td>
        </tr></tfoot>
      </table>
      ${sessionsSorted.length > visibleCount ? `<button class="show-all-btn" id="showAllBtn" onclick="document.querySelectorAll('.session-hidden').forEach(function(r){r.style.display='table-row'});this.style.display='none'">Show all ${sessionsSorted.length} sessions</button>` : ""}
    </div>
  </div>

  <!-- 8. Methodology -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">7</div>
      <div class="section-title">Methodology</div>
    </div>

    <details class="method-details">
      <summary>Calculation Pipeline</summary>
      <div class="inner">
        <div class="formula-box">CO2 (gCO2e) = (tokens x Wh/token x PUE) / 1000 x carbon_intensity

Where:
  tokens           = input + output + cache_read + cache_write
  Wh/token         = model-specific (see table below)
  PUE              = ${PUE} (datacenter overhead multiplier)
  carbon_intensity = ${intensity} gCO2/kWh (${region.toUpperCase()})</div>
        <p style="margin-top:8px">Token count explains ~44% of energy variance (R\u00B2\u22480.44). Inference time is a stronger predictor but unavailable via API.</p>
      </div>
    </details>

    <details class="method-details">
      <summary>Energy per Token</summary>
      <div class="inner">
        <table class="method-table">
          <thead><tr><th>Model</th><th style="text-align:right">Wh/token</th></tr></thead>
          <tbody>${methodModelRows}</tbody>
        </table>
        <p style="font-size:12px;color:var(--dim);margin-top:8px">Based on Luccioni et al. (2023). Conservative upper-bound estimates.</p>
      </div>
    </details>

    <details class="method-details">
      <summary>Regional Carbon Intensity</summary>
      <div class="inner">
        <table class="method-table">
          <thead><tr><th>Region</th><th style="text-align:right">gCO2/kWh</th></tr></thead>
          <tbody>${methodRegionRows}</tbody>
        </table>
        <p style="font-size:12px;color:var(--dim);margin-top:8px">Source: IEA 2023. Your region (${region.toUpperCase()}) is highlighted.</p>
      </div>
    </details>

    <details class="method-details">
      <summary>Sources & Limitations</summary>
      <div class="inner">
        <p style="margin-bottom:8px"><strong style="color:var(--text)">Sources</strong></p>
        <div style="padding-left:12px;line-height:2">
          \u2014 IEA (2023). Electricity 2024.<br>
          \u2014 Luccioni et al. (2023). Power Hungry Processing.<br>
          \u2014 Mamun et al. (2026). arXiv:2604.02776. Token-energy correlation (R\u00B2\u22480.44).<br>
          \u2014 Patterson et al. (2021). Carbon Emissions and Large Neural Networks.<br>
          \u2014 EPA (2024). Greenhouse Gas Equivalencies Calculator.<br>
          \u2014 Uptime Institute (2023). Global Data Center Survey.
        </div>
        <p style="margin-top:12px;margin-bottom:8px"><strong style="color:var(--text)">Limitations</strong></p>
        <div style="padding-left:12px;line-height:2">
          \u2014 Token-energy correlation is moderate (R\u00B2\u22480.44).<br>
          \u2014 Actual GPU hardware and batch sizes unknown.<br>
          \u2014 Exact datacenter location and real-time grid intensity unknown.<br>
          \u2014 Embodied carbon (manufacturing) not included.<br>
          \u2014 We use conservative upper-bound estimates.
        </div>
      </div>
    </details>
  </div>

  <!-- 9. Footer -->
  <div class="footer">
    <div><strong>Generated by co2de v0.1.0</strong></div>
    <div>Sources: IEA 2023, Luccioni et al. 2023, Mamun et al. 2026 (arXiv:2604.02776) | Token-based CO2 is an approximation (R\u00B2 \u2248 0.44)</div>
  </div>

</div>

<script>
/* Table sorting */
(function(){
  var table = document.getElementById('sessionTable');
  if (!table) return;
  var headers = table.querySelectorAll('thead th[data-col]');
  var tbody = table.querySelector('tbody');
  var sortCol = -1, sortAsc = true;

  headers.forEach(function(th){
    th.addEventListener('click', function(){
      var col = parseInt(th.getAttribute('data-col'));
      var type = th.getAttribute('data-type');
      if (sortCol === col) { sortAsc = !sortAsc; } else { sortCol = col; sortAsc = true; }

      headers.forEach(function(h){ h.classList.remove('sorted'); });
      th.classList.add('sorted');
      th.querySelector('.sort-arrow').innerHTML = sortAsc ? '&#9650;' : '&#9660;';

      var rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort(function(a, b){
        var aVal = a.cells[col].textContent.trim();
        var bVal = b.cells[col].textContent.trim();
        if (type === 'num') {
          var aNum = parseFloat(aVal.replace(/[^0-9.\\-]/g, '')) || 0;
          var bNum = parseFloat(bVal.replace(/[^0-9.\\-]/g, '')) || 0;
          return sortAsc ? aNum - bNum : bNum - aNum;
        }
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
      rows.forEach(function(r){ tbody.appendChild(r); });
    });
  });
})();
</script>
</body>
</html>`;

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `co2de-report-${dateStr}.html`;
  const filePath = join(outputDir, filename);
  writeFileSync(filePath, html);
  return filePath;
}

const DETAIL_COLORS = ["#78350F", "#B45309", "#D97706", "#92400E", "#A16207", "#854D0E", "#713F12"];

// ─── Detail Sections (--detail only, dark theme) ─────────

function renderDetailSections(data: ReportData): string {
  const region = data.config.region;
  const intensity = CARBON_INTENSITY_GCO2_PER_KWH[region] ?? CARBON_INTENSITY_GCO2_PER_KWH["global"];

  // --- Session Table ---
  const sessionsSorted = [...data.sessions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const sessionRows = sessionsSorted.map((s, i) => {
    const co2Color = s.co2_grams > 50 ? "var(--coral)" : s.co2_grams > 10 ? "var(--peach)" : "var(--muted)";
    return `<tr>
      <td style="color:var(--dim)">${i + 1}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px">${s.id.slice(0, 7)}</td>
      <td>${s.timestamp.slice(0, 16).replace("T", " ")}</td>
      <td>${shortModel(s.model)}</td>
      <td style="text-align:right">${formatTokens(s.total_tokens)}</td>
      <td style="text-align:right;font-weight:600;color:${co2Color}">~${fmtCO2(s.co2_grams)}</td>
      <td style="text-align:right">$${s.cost_usd.toFixed(2)}</td>
    </tr>`;
  }).join("");

  const totalCost = data.sessions.reduce((s, sess) => s + sess.cost_usd, 0);

  // --- Savings ---
  const s = data.savings;
  const savedPct = s.worst_case_co2_grams > 0
    ? ((s.saved_co2_grams / s.worst_case_co2_grams) * 100).toFixed(1)
    : "0.0";
  const actualPct = s.worst_case_co2_grams > 0
    ? ((s.actual_co2_grams / s.worst_case_co2_grams) * 100).toFixed(0)
    : "100";

  const breakdownItems = s.savings_breakdown.length > 0
    ? s.savings_breakdown.map(b =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #222;font-size:13px">
          <span style="color:var(--muted)">${b.category}</span>
          <span style="color:#4ade80;font-weight:600">-${fmtCO2(b.saved_grams)}</span>
        </div>`).join("")
    : `<div style="color:var(--dim);font-size:13px;padding:12px 0">No model-based savings detected (all sessions used Opus).</div>`;

  // --- Methodology ---
  const modelRows = Object.entries(ENERGY_PER_TOKEN_WH)
    .filter(([k]) => k !== "default")
    .map(([name, rate]) =>
      `<tr><td style="padding:6px 12px">${name}</td><td style="text-align:right;padding:6px 12px;font-family:'JetBrains Mono',monospace">${rate}</td></tr>`)
    .join("");

  const regionRows = Object.entries(CARBON_INTENSITY_GCO2_PER_KWH)
    .sort((a, b) => a[1] - b[1])
    .map(([code, val]) =>
      `<tr${code === region ? ' style="background:#1a1a2e"' : ""}>
        <td style="padding:6px 12px">${code.toUpperCase()}</td>
        <td style="text-align:right;padding:6px 12px;font-family:'JetBrains Mono',monospace">${val}</td>
      </tr>`)
    .join("");

  return `
  <!-- DETAIL: Session Table -->
  <div style="margin:24px 0" class="fade-up">
    <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:16px">Session Detail</div>
    <div style="background:var(--card);border-radius:16px;border:1px solid #222;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#1a1a1a;border-bottom:1px solid #333">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase">ID</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase">Date</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase">Model</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase">Tokens</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase">~CO2</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase">Cost</th>
          </tr>
        </thead>
        <tbody style="color:var(--text)">
          ${sessionRows}
          <tr style="border-top:2px solid #333;font-weight:700">
            <td colspan="4" style="padding:10px 12px;text-align:right;color:var(--muted)">TOTAL</td>
            <td style="padding:10px 12px;text-align:right">${formatTokens(data.totalTokens)}</td>
            <td style="padding:10px 12px;text-align:right;color:var(--coral)">~${fmtCO2(data.totalCO2)}</td>
            <td style="padding:10px 12px;text-align:right">$${totalCost.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- DETAIL: Savings -->
  <div style="margin:24px 0" class="fade-up">
    <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:16px">Efficiency & Savings</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="background:var(--card);border-radius:16px;border:1px solid #222;padding:24px">
        <div style="font-size:13px;color:var(--muted);margin-bottom:8px">Saved vs Worst-Case</div>
        <div style="font-size:36px;font-weight:900;color:#4ade80">${savedPct}%</div>
        <div style="height:12px;background:#222;border-radius:6px;margin:12px 0;overflow:hidden;display:flex">
          <div style="width:${actualPct}%;background:var(--peach);border-radius:6px 0 0 6px"></div>
          <div style="width:${100 - parseInt(actualPct)}%;background:#4ade80"></div>
        </div>
        <div style="font-size:12px;color:var(--muted);line-height:1.8">
          Actual: <strong style="color:var(--text)">~${fmtCO2(s.actual_co2_grams)}</strong><br>
          Worst-case: <strong style="color:var(--text)">~${fmtCO2(s.worst_case_co2_grams)}</strong><br>
          Saved: <strong style="color:#4ade80">${fmtCO2(s.saved_co2_grams)}</strong>
        </div>
        <div style="font-size:11px;color:var(--dim);margin-top:8px">Worst-case = all tokens as Opus</div>
      </div>
      <div style="background:var(--card);border-radius:16px;border:1px solid #222;padding:24px">
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px">Breakdown</div>
        ${breakdownItems}
      </div>
    </div>
  </div>

  <!-- DETAIL: Methodology -->
  <div style="margin:24px 0" class="fade-up">
    <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:16px">Methodology</div>

    <details style="background:var(--card);border:1px solid #222;border-radius:16px;margin-bottom:8px">
      <summary style="padding:16px 20px;font-weight:600;font-size:14px;cursor:pointer;color:var(--text);list-style:none">Calculation Pipeline</summary>
      <div style="padding:0 20px 20px;font-size:13px;color:var(--muted);line-height:1.7">
        <pre style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:14px 18px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text);overflow-x:auto;margin:12px 0">
CO2 (gCO2e) = (tokens x Wh/token x PUE) / 1000 x carbon_intensity

Where:
  tokens          = input + output + cache_read + cache_write
  Wh/token        = model-specific (see table)
  PUE             = ${PUE} (datacenter overhead)
  carbon_intensity = ${intensity} gCO2/kWh (${region.toUpperCase()})
        </pre>
        <p style="margin-top:8px">Token count explains ~44% of energy variance (R\u00B2\u22480.44). Inference time is a stronger predictor but unavailable via API.</p>
      </div>
    </details>

    <details style="background:var(--card);border:1px solid #222;border-radius:16px;margin-bottom:8px">
      <summary style="padding:16px 20px;font-weight:600;font-size:14px;cursor:pointer;color:var(--text);list-style:none">Energy per Token by Model</summary>
      <div style="padding:0 20px 20px">
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
          <thead><tr style="border-bottom:1px solid #333">
            <th style="text-align:left;padding:6px 12px;color:var(--dim);font-size:11px;text-transform:uppercase">Model</th>
            <th style="text-align:right;padding:6px 12px;color:var(--dim);font-size:11px;text-transform:uppercase">Wh/token</th>
          </tr></thead>
          <tbody style="color:var(--text)">${modelRows}</tbody>
        </table>
        <p style="font-size:11px;color:var(--dim);margin-top:8px">Based on Luccioni et al. (2023). Conservative upper-bound estimates.</p>
      </div>
    </details>

    <details style="background:var(--card);border:1px solid #222;border-radius:16px;margin-bottom:8px">
      <summary style="padding:16px 20px;font-weight:600;font-size:14px;cursor:pointer;color:var(--text);list-style:none">Regional Carbon Intensity</summary>
      <div style="padding:0 20px 20px">
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
          <thead><tr style="border-bottom:1px solid #333">
            <th style="text-align:left;padding:6px 12px;color:var(--dim);font-size:11px;text-transform:uppercase">Region</th>
            <th style="text-align:right;padding:6px 12px;color:var(--dim);font-size:11px;text-transform:uppercase">gCO2/kWh</th>
          </tr></thead>
          <tbody style="color:var(--text)">${regionRows}</tbody>
        </table>
        <p style="font-size:11px;color:var(--dim);margin-top:8px">Source: IEA 2023. Your region (${region.toUpperCase()}) is highlighted.</p>
      </div>
    </details>

    <details style="background:var(--card);border:1px solid #222;border-radius:16px">
      <summary style="padding:16px 20px;font-weight:600;font-size:14px;cursor:pointer;color:var(--text);list-style:none">Sources & Limitations</summary>
      <div style="padding:0 20px 20px;font-size:12px;color:var(--muted);line-height:1.8">
        <p style="margin-bottom:8px"><strong style="color:var(--text)">Sources</strong></p>
        <div style="padding-left:12px">
          \u2014 IEA (2023). Electricity 2024.<br>
          \u2014 Luccioni et al. (2023). Power Hungry Processing.<br>
          \u2014 Mamun et al. (2026). arXiv:2604.02776. Token-energy correlation.<br>
          \u2014 Patterson et al. (2021). Carbon Emissions and Large Neural Networks.<br>
          \u2014 EPA (2024). Greenhouse Gas Equivalencies Calculator.<br>
          \u2014 Uptime Institute (2023). Global Data Center Survey.
        </div>
        <p style="margin-top:12px"><strong style="color:var(--text)">Limitations</strong></p>
        <div style="padding-left:12px">
          \u2014 Token-energy correlation is moderate (R\u00B2\u22480.44).<br>
          \u2014 Actual GPU hardware and batch sizes unknown.<br>
          \u2014 Exact datacenter location and real-time grid intensity unknown.<br>
          \u2014 Embodied carbon (manufacturing) not included.<br>
          \u2014 We use conservative upper-bound estimates.
        </div>
      </div>
    </details>
  </div>`;
}

// ─── Main Export ──────────────────────────────────────────

export function generateHTMLReport(
  data: ReportData,
  outputDir: string,
  detail = false,
): string {
  if (detail) {
    return generateDetailReport(data, outputDir);
  }

  // --- Derived data ---
  const totalCost = data.sessions.reduce((s, sess) => s + sess.cost_usd, 0);
  const carbonCostRatio = totalCost > 0 ? data.totalCO2 / totalCost : 0;

  // Period dates
  const sorted = [...data.sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const periodStart = sorted.length > 0 ? sorted[0].timestamp.slice(0, 10).replace(/-/g, ".") : "";
  const periodEnd = sorted.length > 0 ? sorted[sorted.length - 1].timestamp.slice(0, 10).replace(/-/g, ".") : "";

  // Stats
  const uniqueDays = new Set(data.sessions.map(s => s.timestamp.slice(0, 10)));
  const activeDays = uniqueDays.size;

  // Equivalents
  const m = data.metaphors;
  const carKm = formatDistance(m.car_drive_meters);
  const phoneCharges = Math.round(m.phone_charges);
  const netflixHours = (m.netflix_streaming_seconds / 3600).toFixed(1);
  const googleSearches = Math.round(m.google_searches);

  // Model breakdown
  const modelMap = new Map<string, { co2: number; tokens: number; sessions: number }>();
  for (const s of data.sessions) {
    const key = shortModel(s.model);
    const existing = modelMap.get(key) ?? { co2: 0, tokens: 0, sessions: 0 };
    existing.co2 += s.co2_grams;
    existing.tokens += s.total_tokens;
    existing.sessions++;
    modelMap.set(key, existing);
  }
  const models = Array.from(modelMap.entries())
    .map(([name, d], i) => ({ name, ...d, color: MODEL_COLORS[i % MODEL_COLORS.length] }))
    .sort((a, b) => b.co2 - a.co2);
  const modelTotalCO2 = models.reduce((s, mm) => s + mm.co2, 0) || 1;

  // Region
  const userRegion = data.config.region;
  const userIntensity = CARBON_INTENSITY_GCO2_PER_KWH[userRegion] ?? CARBON_INTENSITY_GCO2_PER_KWH["global"];

  // Model rows for receipt
  const modelRowsReceipt = models.map(mm => {
    const pct = ((mm.co2 / modelTotalCO2) * 100).toFixed(0);
    return `<div class="line"><span class="l">&nbsp;&nbsp;${mm.name}</span><span class="r">${pct}%&nbsp;&nbsp;&nbsp;&nbsp;~${fmtCO2(mm.co2)}</span></div>`;
  }).join("\n");

  // Region comparison rows for receipt (France, Norway, India)
  const frCO2 = userIntensity > 0 ? (data.totalCO2 * CARBON_INTENSITY_GCO2_PER_KWH["fr"]) / userIntensity : 0;
  const noCO2 = userIntensity > 0 ? (data.totalCO2 * CARBON_INTENSITY_GCO2_PER_KWH["no"]) / userIntensity : 0;
  const inCO2 = userIntensity > 0 ? (data.totalCO2 * CARBON_INTENSITY_GCO2_PER_KWH["in"]) / userIntensity : 0;
  const frDiff = data.totalCO2 > 0 ? Math.round(((frCO2 - data.totalCO2) / data.totalCO2) * 100) : 0;
  const noDiff = data.totalCO2 > 0 ? Math.round(((noCO2 - data.totalCO2) / data.totalCO2) * 100) : 0;
  const inDiff = data.totalCO2 > 0 ? Math.round(((inCO2 - data.totalCO2) / data.totalCO2) * 100) : 0;

  // Period date formatting for receipt header (e.g. "Apr 07 -> Apr 14")
  const fmtReceiptDate = (iso: string): string => {
    if (!iso) return "";
    const d = new Date(iso.replace(/\./g, "-"));
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
  };
  const receiptStart = fmtReceiptDate(periodStart);
  const receiptEnd = fmtReceiptDate(periodEnd);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>co2de carbon receipt — ${data.period}</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  background:#0a0a0a;
  min-height:100vh;
  display:flex;
  justify-content:center;
  padding:40px 16px 80px;
  font-family:'JetBrains Mono',monospace;
}
.receipt-wrap{
  width:100%;
  max-width:380px;
}
.receipt{
  background:#faf8f0;
  color:#1a1a1a;
  border-radius:8px 8px 0 0;
  padding:32px 24px 24px;
  position:relative;
  box-shadow:0 4px 24px rgba(0,0,0,.5);
  font-size:13px;
  line-height:1.6;
}
.receipt::after{
  content:'';
  position:absolute;
  bottom:-10px;
  left:0;
  width:100%;
  height:10px;
  background:
    linear-gradient(135deg, #faf8f0 33.33%, transparent 33.33%) 0 0,
    linear-gradient(-135deg, #faf8f0 33.33%, transparent 33.33%) 0 0;
  background-size:12px 10px;
  background-repeat:repeat-x;
}
.receipt-shadow{
  height:20px;
  margin:0 8px;
  background:rgba(0,0,0,.15);
  filter:blur(8px);
  border-radius:0 0 50% 50%;
}

/* Header */
.header{text-align:center;margin-bottom:4px}
.logo{font-size:24px;font-weight:700;letter-spacing:-1px}
.logo .two{color:#cc4444}
.subtitle{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#666;margin-top:2px}
.date-range{font-size:12px;color:#888;margin-top:6px}

/* Divider */
.divider{
  border:none;
  border-top:1.5px dashed #ccc;
  margin:14px 0;
}

/* Lines */
.line{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  padding:2px 0;
  font-size:13px;
}
.line .l{color:#444}
.line .r{font-weight:500;text-align:right}

/* Section headers */
.section-hdr{
  font-size:11px;
  font-weight:700;
  letter-spacing:2px;
  text-transform:uppercase;
  color:#1a1a1a;
  margin-bottom:4px;
  margin-top:2px;
}

/* Subtotal / Total emphasis */
.line-total .r{font-weight:700;font-size:15px}
.line-grand{font-size:14px;font-weight:700}
.line-grand .r{font-size:15px}

/* Equivalents */
.equiv{padding:2px 0;font-size:12px;color:#555}
.equiv .symbol{color:#888;margin-right:2px}
.equiv .val{float:right;color:#1a1a1a;font-weight:500}

/* Region */
.region-line{display:flex;justify-content:space-between;font-size:12px;padding:1px 0}
.region-line .name{color:#555}
.region-line .data{text-align:right;color:#1a1a1a;font-weight:500}
.region-line .diff-neg{color:#2a7a2a}
.region-line .diff-pos{color:#cc3333}

/* Disclaimer */
.disclaimer{
  font-size:10px;
  color:#999;
  line-height:1.5;
  margin-top:2px;
}

/* Barcode */
.barcode{
  display:flex;
  justify-content:center;
  align-items:flex-end;
  gap:1px;
  height:40px;
  margin:16px auto 8px;
  max-width:200px;
}
.barcode .bar{
  background:#1a1a1a;
  flex-shrink:0;
}

/* Footer text */
.receipt-footer{
  text-align:center;
  font-size:11px;
  color:#888;
  margin-top:4px;
}
.receipt-footer .version{font-size:10px;color:#aaa;margin-top:2px}
.tagline{
  text-align:center;
  font-size:11px;
  color:#999;
  margin-top:12px;
  font-style:italic;
  letter-spacing:0.5px;
}
</style>
</head>
<body>

<div class="receipt-wrap">
  <div class="receipt">
    <!-- Header -->
    <div class="header">
      <div class="logo">co<span class="two">2</span>de</div>
      <div class="subtitle">Carbon Receipt</div>
      <div class="date-range">${receiptStart} \u2192 ${receiptEnd}</div>
    </div>

    <hr class="divider">

    <!-- Summary stats -->
    <div class="line"><span class="l">TOKENS</span><span class="r">${formatTokens(data.totalTokens)}</span></div>
    <div class="line"><span class="l">SESSIONS</span><span class="r">${data.sessions.length}</span></div>
    <div class="line"><span class="l">ACTIVE DAYS</span><span class="r">${activeDays}</span></div>

    <hr class="divider">

    <!-- Model breakdown -->
    <div class="section-hdr">Model Breakdown</div>
    ${modelRowsReceipt}

    <hr class="divider">

    <!-- Subtotal -->
    <div class="line line-total"><span class="l">SUBTOTAL</span><span class="r">~${fmtCO2(data.totalCO2)}</span></div>

    <div style="height:8px"></div>

    <!-- Equivalents -->
    <div class="equiv"><span class="symbol">\u2248</span> driving<span class="val">${carKm}</span></div>
    <div class="equiv"><span class="symbol">\u2248</span> Netflix<span class="val">${netflixHours} hrs</span></div>
    <div class="equiv"><span class="symbol">\u2248</span> Google<span class="val">${googleSearches.toLocaleString()} srch</span></div>
    <div class="equiv"><span class="symbol">\u2248</span> phone chg<span class="val">${phoneCharges.toLocaleString()}</span></div>

    <hr class="divider">

    <!-- Cost -->
    <div class="line line-grand"><span class="l">TOTAL COST</span><span class="r">$${totalCost.toFixed(2)}</span></div>
    <div class="line"><span class="l">CARBON COST</span><span class="r">~${carbonCostRatio.toFixed(2)}g/$</span></div>

    <hr class="divider">

    <!-- Region -->
    <div class="section-hdr">REGION: ${userRegion.toUpperCase()} (${userIntensity} gCO2/kWh)</div>
    <div class="region-line"><span class="name">&nbsp;&nbsp;If France</span><span class="data">~${fmtCO2(frCO2)}&nbsp;&nbsp;<span class="${frDiff <= 0 ? "diff-neg" : "diff-pos"}">${frDiff > 0 ? "+" : ""}${frDiff}%</span></span></div>
    <div class="region-line"><span class="name">&nbsp;&nbsp;If Norway</span><span class="data">~${fmtCO2(noCO2)}&nbsp;&nbsp;<span class="${noDiff <= 0 ? "diff-neg" : "diff-pos"}">${noDiff > 0 ? "+" : ""}${noDiff}%</span></span></div>
    <div class="region-line"><span class="name">&nbsp;&nbsp;If India</span><span class="data">~${fmtCO2(inCO2)}&nbsp;&nbsp;<span class="${inDiff <= 0 ? "diff-neg" : "diff-pos"}">${inDiff > 0 ? "+" : ""}${inDiff}%</span></span></div>

    <hr class="divider">

    <!-- Disclaimer -->
    <div class="disclaimer">
      ~ = token-based estimate<br>
      R\u00B2 \u2248 0.44 vs actual energy<br>
      Mamun et al. 2026
    </div>

    <!-- Barcode -->
    <div class="barcode" id="barcode"></div>
    <div class="receipt-footer">
      <div class="version">co2de v0.1.0</div>
    </div>

    <div style="height:8px"></div>
    <div class="tagline">know the cost of<br>your convenience</div>
  </div>
  <div class="receipt-shadow"></div>
</div>

<script>
(function(){
  var bc = document.getElementById('barcode');
  var widths = [2,1,3,1,2,1,1,3,2,1,1,2,3,1,2,1,1,3,1,2,1,3,2,1,1,2,1,3,1,2,1,1,2,3,1,2];
  for (var i = 0; i < widths.length; i++) {
    var bar = document.createElement('div');
    bar.className = 'bar';
    var w = widths[i];
    var h = 30 + Math.floor(Math.random() * 10);
    bar.style.cssText = 'width:' + w + 'px;height:' + h + 'px';
    bc.appendChild(bar);
  }
})();
</script>
</body>
</html>`;

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `co2de-report-${dateStr}.html`;
  const filePath = join(outputDir, filename);

  writeFileSync(filePath, html);
  return filePath;
}
