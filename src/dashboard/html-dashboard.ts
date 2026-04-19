import type { DashboardData } from "./data.js";
import { TIPS } from "../engine/tips.js";

/**
 * Generate the co2de web dashboard HTML — the "Soot Ledger".
 *
 * Design principles (captured from research + user feedback):
 *   - Facts primary; metaphors secondary (Chen CHI 2023)
 *   - No "you saved!" celebration (Fraunhofer, Opower boomerang)
 *   - No green iconography — CO2 is pollution
 *   - Every what-if lever must be user-controllable (no cache slider)
 *   - Per-turn visibility closes the "tokens → effect" abstraction gap
 */
export function generateDashboardHTML(data: DashboardData): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>co2de — soot ledger</title>
<style>
${STYLES}
</style>
</head>
<body>
<div class="backdrop" aria-hidden="true"></div>

<main>

<header class="top">
  <div class="brand">co2de<span>ledger</span></div>
  <div class="meta">${data.periodLabel} · region ${data.region} · ${data.sessionCount} sessions</div>
</header>

${renderHero(data)}

${renderAnatomy(data)}

${renderReplay(data)}

${renderPhantom(data)}

${renderSkills()}

${renderReality(data)}

<footer class="bottom">
  <span>co2de · awareness tool, not compliance</span>
  <span>methodology v1.0 · Mamun 2026 · IEA 2023</span>
</footer>

</main>

<div class="tooltip" id="tip"></div>

<script>
${renderScript(data)}
</script>
</body>
</html>
`;
}

// ─── HERO ─────────────────────────────────────────────────

function renderHero(data: DashboardData): string {
  const kg = data.weeklyKg.toFixed(2);
  const annualLabel = data.annualKg >= 1000
    ? `${(data.annualKg / 1000).toFixed(1)} <small>t / yr</small>`
    : `${Math.round(data.annualKg)} <small>kg / yr</small>`;

  const maxKg = Math.max(0.001, ...data.weekly7.map((d) => d.kg));
  const bars = data.weekly7.map((d) => {
    if (d.kg <= 0) {
      return `<div class="bar zero" title="${d.day} · 0 kg"></div>`;
    }
    const h = Math.max(2, Math.round((d.kg / maxKg) * 22));
    return `<div class="bar" style="height: ${h}px" title="${d.day} · ${d.kg.toFixed(2)} kg"></div>`;
  }).join("\n      ");
  const labels = data.weekly7.map((d) => `<span>${d.day.slice(0, 1)}</span>`).join("");

  const deltaHTML = data.deltaText
    ? `<span class="delta">${escapeHtml(data.deltaText)}</span>`
    : "";

  return `<section>
  <h2>this week</h2>

  <div class="hero">
    <div>
      <div class="kg">
        ${kg}
        <span class="unit">kg · CO₂e · this week</span>
      </div>
    </div>
    <div class="pace">
      <div class="label">at this rate</div>
      <div class="value">${annualLabel}</div>
      <div class="helper">
        ${escapeHtml(data.paceHelper)}
        ${deltaHTML ? "<br>" + deltaHTML : ""}
      </div>
    </div>
  </div>

  <div class="sparkline-row">
    <span>7-day</span>
    <div class="sparkline">
      ${bars}
    </div>
    <div class="labels">${labels}</div>
  </div>

  ${renderCalendar(data)}
</section>`;
}

// ─── SOOT CALENDAR (footprints) ──────────────────────────
//
// GitHub-style year-view contribution grid. 53 weeks (columns) × 7 days
// (rows). Semantic inversion from GitHub: darker/rust cells = more
// pollution, not achievement. Empty cells = no trace left (no guilt).

function renderCalendar(data: DashboardData): string {
  const maxKg = Math.max(0.001, ...data.calendar.map((d) => d.kg));

  // Bucket calendar into weeks aligned to Monday.
  // First day in `calendar` is Monday (dayOfWeek=0) per buildDashboardData.
  const weeks: (typeof data.calendar[number] | null)[][] = [];
  let wk: (typeof data.calendar[number] | null)[] = new Array(7).fill(null);
  for (const day of data.calendar) {
    wk[day.dayOfWeek] = day;
    if (day.dayOfWeek === 6) {
      weeks.push(wk);
      wk = new Array(7).fill(null);
    }
  }
  if (wk.some((x) => x !== null)) weeks.push(wk);

  // Month labels — one per column, appear when month changes
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

  // Render cells column by column (GitHub CSS grid auto-flow: column).
  let cellsHTML = "";
  weeks.forEach((week, colIdx) => {
    for (let r = 0; r < 7; r++) {
      const day = week[r];
      if (!day) {
        cellsHTML += `<div class="fcell empty" aria-hidden="true"></div>`;
        continue;
      }
      const tilt = r % 2 === 0 ? -10 : 10;
      if (day.kg <= 0) {
        cellsHTML += `<div class="fcell blank" title="${day.date} · no sessions"></div>`;
        continue;
      }
      const ratio = Math.log10(day.kg + 1) / Math.log10(maxKg + 1);
      const idx = Math.min(4, Math.max(0, Math.round(ratio * 4)));
      const todayCls = day.isToday ? " today" : "";
      cellsHTML += `<div class="fcell${todayCls}" data-date="${day.date}" data-kg="${day.kg.toFixed(2)}" data-sessions="${day.sessions}">${footprintSVGSmall(idx, tilt)}</div>`;
    }
    void colIdx;
  });

  const monthsHTML = monthLabels
    .map((m) => `<span style="grid-column: ${m.col + 1}">${m.label}</span>`)
    .join("");

  const legendFeet = [0, 1, 2, 3, 4]
    .map((i) => `<span class="ramp-foot">${footprintSVGSmall(i, -10)}</span>`)
    .join("");

  const sessionsNote = data.calendarSessions > 0
    ? `~${data.calendarTotalKg.toFixed(1)} kg · ${data.calendarSessions} sessions in the last year`
    : "no sessions in the last year";

  return `<div class="calendar gh">
    <div class="cal-title">${escapeHtml(sessionsNote)}</div>

    <div class="cal-main">
      <div class="cal-months">${monthsHTML}</div>
      <div class="cal-body">
        <div class="cal-dows">
          <span></span>
          <span>Mon</span>
          <span></span>
          <span>Wed</span>
          <span></span>
          <span>Fri</span>
          <span></span>
        </div>
        <div class="cal-cells">${cellsHTML}</div>
      </div>
    </div>

    <div class="cal-footer">
      <span>each print = 1 day · empty = no trace left</span>
      <span class="legend">
        <span>lighter</span>
        ${legendFeet}
        <span>darker</span>
      </span>
    </div>
  </div>`;
}

/** Compact footprint SVG for GitHub-sized cells. */
function footprintSVGSmall(intensity: number, tilt: number): string {
  const SOOT = ['#c0b6a2', '#8a7a65', '#4d3f30', '#231810', '#8b3a1a'];
  const fill = SOOT[intensity];
  return `<svg viewBox="0 0 14 16" width="11" height="13" aria-hidden="true">
    <g transform="rotate(${tilt} 7 8)" fill="${fill}">
      <ellipse cx="7" cy="11" rx="3.5" ry="4.2"/>
      <ellipse cx="8" cy="4.5" rx="2.4" ry="2.2"/>
    </g>
  </svg>`;
}

// ─── ANATOMY OF A TURN ────────────────────────────────────

function renderAnatomy(data: DashboardData): string {
  const a = data.anatomy;
  const maxTok = Math.max(a.avgCacheReadTok, a.avgCacheWriteTok, a.avgInputTok, a.avgOutputTok, 1);

  const pct = (n: number) => `${Math.max(2, Math.round((n / maxTok) * 100))}%`;
  const fmtG = (g: number) => g < 0.01 ? "~0.01 g" : `~${g.toFixed(2)} g`;
  const fmtTok = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;

  return `<section>
  <h2>anatomy of a turn · where the tokens go</h2>

  <div class="replay-head">
    <div class="title">What happens when you hit Enter.</div>
    <div class="sub">${a.turnCount} turns observed · ~${a.avgTurnG.toFixed(2)} g/turn avg · ${escapeHtml(shortModelFam(a.dominantModel))}</div>
  </div>

  <div class="flow" id="flow">

    <div class="stage pay" data-stage="0">
      <div class="stage-head">
        <span class="stage-tag pay">new</span>
        <span class="stage-name">Your prompt</span>
      </div>
      <div class="stage-body">
        <div class="stage-num">${fmtTok(a.avgInputTok)} <small>tok</small></div>
        <div class="stage-bar"><div class="fill" style="width: ${pct(a.avgInputTok)}"></div></div>
        <div class="stage-g" data-g="${a.avgInputG.toFixed(3)}">${fmtG(a.avgInputG)}</div>
        <div class="stage-note">the text you actually type · every token prefilled fresh</div>
      </div>
    </div>

    <div class="arrow" data-arrow="0">↓<span class="arrow-note">client assembles the context</span></div>

    <div class="stage cache" data-stage="1">
      <div class="stage-head">
        <span class="stage-tag cache">cache</span>
        <span class="stage-name">Context recalled from cache</span>
      </div>
      <div class="stage-body">
        <div class="stage-num">${fmtTok(a.avgCacheReadTok)} <small>tok</small></div>
        <div class="stage-bar"><div class="fill cache" style="width: ${pct(a.avgCacheReadTok)}"></div></div>
        <div class="stage-g" data-g="${a.avgCacheReadG.toFixed(3)}">${fmtG(a.avgCacheReadG)}</div>
        <div class="stage-note">system prompt · tools · CLAUDE.md · conversation history — at 10% energy if cache-resident</div>
      </div>
    </div>

    <div class="arrow" data-arrow="1">↓</div>

    <div class="stage pay" data-stage="2">
      <div class="stage-head">
        <span class="stage-tag pay">write</span>
        <span class="stage-name">New context written to cache</span>
      </div>
      <div class="stage-body">
        <div class="stage-num">${fmtTok(a.avgCacheWriteTok)} <small>tok</small></div>
        <div class="stage-bar"><div class="fill" style="width: ${pct(a.avgCacheWriteTok)}"></div></div>
        <div class="stage-g" data-g="${a.avgCacheWriteG.toFixed(3)}">${fmtG(a.avgCacheWriteG)}</div>
        <div class="stage-note">new chunks added to context · full energy this turn, cached from now on</div>
      </div>
    </div>

    <div class="arrow pulse" data-arrow="2">↓<span class="arrow-note">model prefills · then decodes</span></div>

    <div class="stage out" data-stage="3">
      <div class="stage-head">
        <span class="stage-tag out">out</span>
        <span class="stage-name">Generated response</span>
      </div>
      <div class="stage-body">
        <div class="stage-num">${fmtTok(a.avgOutputTok)} <small>tok</small></div>
        <div class="stage-bar"><div class="fill out" style="width: ${pct(a.avgOutputTok)}"></div></div>
        <div class="stage-g" data-g="${a.avgOutputG.toFixed(3)}">${fmtG(a.avgOutputG)}</div>
        <div class="stage-note">every output token costs full energy · no cache discount · even thinking tokens</div>
      </div>
    </div>

    <div class="arrow loop" data-arrow="3">↓ if tool call · loops back to cache with tool result appended</div>

    <div class="total-turn" id="total-turn">
      <span>one average turn</span>
      <span class="total-g" data-g="${a.avgTurnG.toFixed(3)}">~${a.avgTurnG.toFixed(2)} g CO₂e</span>
    </div>

    <button class="replay-btn" id="flow-replay" type="button">↻ replay</button>
  </div>

  <div class="influences">
    <div class="inf-title">where you can change the shape</div>
    <div class="inf-grid">
      <div class="inf-cell">
        <div class="inf-key">prompt</div>
        <div class="inf-body">name references · drop role preambles · "src/auth.ts:40-60"</div>
      </div>
      <div class="inf-cell">
        <div class="inf-key">cache</div>
        <div class="inf-body">stable CLAUDE.md · no mid-session /clear · batch adjacent asks</div>
      </div>
      <div class="inf-cell">
        <div class="inf-key">output</div>
        <div class="inf-body">"one-line diff, no prose" · bounded answer shape</div>
      </div>
    </div>
  </div>
</section>`;
}

function shortModelFam(m: string): string {
  const ml = m.toLowerCase();
  if (ml.includes("opus")) return "opus";
  if (ml.includes("sonnet")) return "sonnet";
  if (ml.includes("haiku")) return "haiku";
  return m;
}

// ─── SESSION REPLAY ───────────────────────────────────────

function renderReplay(data: DashboardData): string {
  const notes = data.featured.annotations.map((a, i) => `
    <div class="note" data-idx="${i}">
      <div class="ts">${escapeHtml(a.ts)}</div>
      <div class="what">${escapeHtml(a.what)}</div>
      <div class="detail">${a.detail}</div>
    </div>
  `).join("\n");

  return `<section>
  <h2>session replay</h2>

  <div class="replay-head">
    <div class="title">What did this session do to the atmosphere?</div>
    <div class="sub">${escapeHtml(data.featured.dateLabel)}</div>
  </div>

  <div class="replay">
    <div class="cumulative">
      <div class="cap">cumulative CO₂e (g)</div>
      <svg viewBox="0 0 400 220" id="cumulative">
        <line x1="36" y1="10" x2="36" y2="190" stroke="#d9d4c9" stroke-width="1"/>
        <line x1="36" y1="190" x2="395" y2="190" stroke="#d9d4c9" stroke-width="1"/>
        <g class="axis-y" font-size="9" fill="#8b7f74" font-family="SF Mono, monospace">
          <text x="32" y="13" text-anchor="end">${Math.round(data.featured.totalGrams)}</text>
          <text x="32" y="103" text-anchor="end">${Math.round(data.featured.totalGrams / 2)}</text>
          <text x="32" y="193" text-anchor="end">0</text>
          <line x1="36" y1="100" x2="395" y2="100" stroke="#e8e4d9" stroke-dasharray="2 3"/>
        </g>
        <path id="cumPath" fill="rgba(58,51,44,0.08)" stroke="#3a332c" stroke-width="1.5" stroke-linejoin="round"/>
        <g id="markers"></g>
      </svg>
      <div class="axis-x"><span>${data.featured.startLabel}</span><span>${data.featured.midLabel}</span><span>${data.featured.endLabel}</span></div>
    </div>

    <div class="notes" id="notes">
${notes}
    </div>
  </div>
</section>`;
}

// ─── PHANTOM LAYER ────────────────────────────────────────

function renderPhantom(data: DashboardData): string {
  const maxKg = Math.max(0.001, ...data.modelBars.map((b) => b.kg), data.weeklyKg);
  const bars = data.modelBars.map((b) => {
    const widthPct = Math.round((b.kg / maxKg) * 100);
    const phantomPct = b.phantomKg ? Math.round((b.phantomKg / maxKg) * 100) : 0;
    const phantom = b.phantomKg
      ? `<div class="phantom-box" style="left: 0; width: ${phantomPct}%"></div>`
      : "";
    const phantomNote = b.phantomKg
      ? `<span class="phantom-note">phantom = if all sessions used ${b.name} · ${b.phantomKg.toFixed(2)} kg</span>`
      : "<span></span>";
    const tokensLabel = fmtTokensShort(b.tokens);
    return `
      <div class="bar-row">
        <div class="lbl"><span class="name">${b.name}</span><span>actual ${b.kg.toFixed(2)} kg · ${tokensLabel} tok</span></div>
        <div class="track">
          <div class="actual" style="width: ${widthPct}%"></div>
          ${phantom}
        </div>
        <div class="foot"><span>${(b.share * 100).toFixed(0)}% of weekly CO₂</span>${phantomNote}</div>
      </div>`;
  }).join("");

  const avoidableKg = data.avoidablePoolKg.toFixed(2);

  return `<section>
  <h2>phantom layer · what could have been · no model change</h2>

  <div class="phantom">
    <div class="bars">${bars}</div>

    <div class="whatif">
      <h3>what if · same model, same productivity</h3>

      <div class="slider-block">
        <div class="srow">
          <span>prompt brevity · drop preambles, name references</span>
          <span class="val" id="v1">15%</span>
        </div>
        <input type="range" id="s1" min="0" max="40" value="15" step="5" />
        <div class="save">saves <b id="save1">0.00 kg</b> · tighter prompts shrink new input every turn · direct user behavior</div>
      </div>

      <div class="slider-block">
        <div class="srow">
          <span>redundant turns cut</span>
          <span class="val" id="v2">20%</span>
        </div>
        <input type="range" id="s2" min="0" max="50" value="20" step="5" />
        <div class="save">saves <b id="save2">0.00 kg</b> · re-reads, regenerations, avoidable thinking · pool ~${avoidableKg} kg/wk</div>
      </div>

      <div class="projection">
        <div class="pcell">
          <div class="k">this week</div>
          <div class="v" id="projWeek">${data.weeklyKg.toFixed(2)} <small>kg</small></div>
          <div class="v"><small id="projWeekDelta">0.0%</small></div>
        </div>
        <div class="pcell">
          <div class="k">at that rate</div>
          <div class="v" id="projYear">${Math.round(data.annualKg)} <small>kg/yr</small></div>
          <div class="v"><small id="projYearDelta">vs ${Math.round(data.annualKg)} baseline</small></div>
        </div>
      </div>
    </div>
  </div>
</section>`;
}

// ─── SKILLS ───────────────────────────────────────────────

function renderSkills(): string {
  const featured = TIPS.slice(0, 2);
  const rest = TIPS.slice(2);

  const featuredHTML = featured.map((t) => `
    <div class="skill-card featured">
      <div class="cat">${t.category}</div>
      <div class="name">${escapeHtml(t.name)}</div>
      <div class="pair">
        <div class="line"><span class="mark bad">×</span><span class="text bad">${escapeHtml(t.before)}</span></div>
        <div class="line"><span class="mark good">✓</span><span class="text good">${escapeHtml(t.after)}</span></div>
      </div>
      <div class="why">${escapeHtml(t.why)}</div>
    </div>`).join("");

  const restHTML = rest.map((t) => `
    <div class="skill-card">
      <div class="cat">${t.category}</div>
      <div class="name smaller">${escapeHtml(t.name)}</div>
      <div class="pair">
        <div class="line"><span class="mark bad">×</span><span class="text bad">${escapeHtml(t.before)}</span></div>
        <div class="line"><span class="mark good">✓</span><span class="text good">${escapeHtml(t.after)}</span></div>
      </div>
      <div class="why">${escapeHtml(t.why)}</div>
    </div>`).join("");

  return `<section>
  <h2>skills · same model, smarter use</h2>

  <div class="replay-head">
    <div class="title">No downgrade. Same Opus, fewer wasted tokens.</div>
    <div class="sub">three pillars · prompt · response · cache · Mamun 2026 (R²≈0.44)</div>
  </div>

  <div class="skills-top">${featuredHTML}</div>

  <div class="section-divider">more techniques · apply to any session</div>

  <div class="skills-rest">${restHTML}</div>
</section>`;
}

// ─── GRID REALITY ─────────────────────────────────────────

function renderReality(data: DashboardData): string {
  const deltaPct = data.regionGCO2 > 0
    ? Math.round(((data.inferenceRegionGCO2 - data.regionGCO2) / data.regionGCO2) * 100)
    : 0;
  const sign = deltaPct >= 0 ? "+" : "";

  return `<section>
  <h2>grid reality · where does this actually burn?</h2>

  <div class="reality-box">
    <div class="reality-table">
      <div class="rrow">
        <span class="rk">your region setting</span>
        <span class="rv"><span class="flag">${data.region}</span>${data.regionGCO2} gCO₂/kWh</span>
      </div>
      <div class="rrow">
        <span class="rk">likely inference grid</span>
        <span class="rv"><span class="flag">${data.inferenceRegion}</span>${data.inferenceRegionGCO2} gCO₂/kWh</span>
      </div>
      <div class="rrow">
        <span class="rk">delta</span>
        <span class="rv" style="color: var(--rust)">${sign}${deltaPct}% vs your display</span>
      </div>
      <div class="rrow">
        <span class="rk">cleaner floor (fr)</span>
        <span class="rv">55 gCO₂/kWh</span>
      </div>
      <div class="rrow">
        <span class="rk">dirtier ceiling (in)</span>
        <span class="rv">630 gCO₂/kWh</span>
      </div>
    </div>
    <div class="reality-body">
      <strong>The region slider is hypothetical.</strong> Anthropic runs inference in US-based datacenters.
      Setting your region to France or Norway doesn't reduce actual emissions — it changes the
      <em>what-if</em> calculation shown here.
      <span class="quiet">
        Real-time grid integration (e.g. Electricity Maps) is on the roadmap. Until then, regional
        numbers are annual averages, not hourly dispatch. Token-based CO₂ is an R²≈0.44 approximation
        of measured energy. All values are order-of-magnitude, prefixed with ~.
      </span>
    </div>
  </div>
</section>`;
}

// ─── SCRIPT ───────────────────────────────────────────────

function renderScript(data: DashboardData): string {
  const turnsJSON = JSON.stringify(data.featured.turns);
  const baselineKg = data.baselineKg;
  const opusKg = data.opusKg;
  const avoidableKg = data.avoidablePoolKg;

  return `
  const turns = ${turnsJSON};

  // ── Tooltip ──
  const tip = document.getElementById('tip');
  function showTip(e, html) {
    tip.innerHTML = html;
    tip.style.left = e.clientX + 'px';
    tip.style.top = (e.clientY - 8) + 'px';
    tip.classList.add('visible');
  }
  function hideTip() { tip.classList.remove('visible'); }

  // ── Soot Calendar hover ──
  document.querySelectorAll('.fcell[data-kg]').forEach((cell) => {
    cell.addEventListener('mousemove', (e) => {
      const kg = parseFloat(cell.getAttribute('data-kg'));
      const sessions = cell.getAttribute('data-sessions');
      const date = cell.getAttribute('data-date');
      const kgFmt = kg < 0.1 ? (kg * 1000).toFixed(0) + ' g' : kg.toFixed(2) + ' kg';
      showTip(e, date + '  ·  <b>' + kgFmt + '</b><br>' + sessions + ' session' + (sessions === '1' ? '' : 's'));
    });
    cell.addEventListener('mouseleave', hideTip);
  });

  // Cumulative curve
  const cum = [];
  let running = 0;
  turns.forEach(t => { running += t.g; cum.push(running); });
  const total = Math.max(running, 1);

  const path = document.getElementById('cumPath');
  const vw = 400, vh = 220;
  const padL = 36, padR = 5, padT = 10, padB = 30;
  const plotW = vw - padL - padR;
  const plotH = vh - padT - padB;

  function xFor(i) {
    return turns.length <= 1 ? padL : padL + (i / (turns.length - 1)) * plotW;
  }
  function yFor(v) { return padT + plotH - (v / total) * plotH; }

  if (turns.length > 0) {
    let d = 'M ' + xFor(0).toFixed(1) + ' ' + yFor(0).toFixed(1);
    cum.forEach((v, i) => { d += ' L ' + xFor(i).toFixed(1) + ' ' + yFor(v).toFixed(1); });
    d += ' L ' + xFor(turns.length - 1).toFixed(1) + ' ' + yFor(0).toFixed(1) + ' Z';
    path.setAttribute('d', d);
  }

  const markers = document.getElementById('markers');
  turns.forEach((turn, i) => {
    if (turn.annoIdx === undefined) return;
    const cx = xFor(i), cy = yFor(cum[i]);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', 4);
    c.setAttribute('fill', '#8b4a2b');
    markers.appendChild(c);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', cx); label.setAttribute('y', cy - 8);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-family', 'SF Mono, monospace');
    label.setAttribute('font-size', '9');
    label.setAttribute('fill', '#8b4a2b');
    label.textContent = (turn.annoIdx + 1);
    markers.appendChild(label);
  });

  // Scroll-triggered annotation highlighting
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); });
  }, { threshold: 0.5 });
  document.querySelectorAll('.note').forEach(n => io.observe(n));

  // ── Anatomy-of-a-turn animation ──
  const flow = document.getElementById('flow');
  if (flow) {
    // Stage timing: output is slower (decode takes longer), others snappy.
    // [stage-enter-delay, hold-time]
    const timeline = [
      { stage: 0, at:   100 },
      { arrow: 0, at:   500 },
      { stage: 1, at:   800 },
      { arrow: 1, at:  1500 },
      { stage: 2, at:  1700 },
      { arrow: 2, at:  2400, processing: true },
      { stage: 3, at:  2700 },
      { arrow: 3, at:  3800 },
      { total:    true, at: 3900 },
    ];

    function animateGram(el, target, duration) {
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const v = target * eased;
        el.textContent = v < 0.01 ? '~0.01 g' : '~' + v.toFixed(2) + ' g';
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
    function animateTotal(el, target, duration) {
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const v = target * eased;
        el.textContent = '~' + v.toFixed(2) + ' g CO₂e';
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function playFlow() {
      // Reset state
      flow.classList.add('animated');
      flow.querySelectorAll('.stage, .arrow, .total-turn').forEach(el => el.classList.remove('in', 'current'));
      flow.querySelectorAll('.arrow').forEach(a => a.classList.remove('processing'));

      const stages = flow.querySelectorAll('.stage');
      const arrows = flow.querySelectorAll('.arrow');
      const total  = flow.querySelector('.total-turn');

      timeline.forEach((ev) => {
        setTimeout(() => {
          if (typeof ev.stage === 'number') {
            const s = stages[ev.stage];
            s.classList.add('in', 'current');
            const gEl = s.querySelector('.stage-g');
            if (gEl) {
              const target = parseFloat(gEl.dataset.g);
              const dur = ev.stage === 3 ? 1000 : 550; // output slower
              animateGram(gEl, target, dur);
            }
            // Clear "current" after this stage's animation completes
            setTimeout(() => s.classList.remove('current'), ev.stage === 3 ? 1100 : 650);
          } else if (typeof ev.arrow === 'number') {
            const a = arrows[ev.arrow];
            a.classList.add('in');
            if (ev.processing) {
              a.classList.add('processing');
              // Stop processing pulse once output stage finishes
              setTimeout(() => a.classList.remove('processing'), 1400);
            }
          } else if (ev.total) {
            total.classList.add('in');
            const g = total.querySelector('.total-g');
            if (g) animateTotal(g, parseFloat(g.dataset.g), 700);
          }
        }, ev.at);
      });
    }

    const flowIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          playFlow();
          flowIO.unobserve(flow);
        }
      }
    }, { threshold: 0.25 });
    flowIO.observe(flow);

    const replayBtn = document.getElementById('flow-replay');
    if (replayBtn) replayBtn.addEventListener('click', playFlow);
  }

  // What-if sliders
  const s1 = document.getElementById('s1');
  const s2 = document.getElementById('s2');
  const v1 = document.getElementById('v1');
  const v2 = document.getElementById('v2');
  const save1 = document.getElementById('save1');
  const save2 = document.getElementById('save2');
  const projWeek = document.getElementById('projWeek');
  const projWeekDelta = document.getElementById('projWeekDelta');
  const projYear = document.getElementById('projYear');
  const projYearDelta = document.getElementById('projYearDelta');

  const BASELINE = ${baselineKg.toFixed(4)};
  // Prompt brevity pool: input tokens you write. Heuristic — tighter
  // prompts save proportionally on the input segment of every turn.
  // Bounded at ~15% of weekly since input is a small slice of CO2.
  const BREVITY_POOL = BASELINE * 0.15;
  const AVOIDABLE_POOL = ${avoidableKg.toFixed(4)};
  const BASELINE_YEAR = BASELINE * 52;

  function recalc() {
    const brevity = +s1.value;
    const cut = +s2.value;
    v1.textContent = brevity + '%';
    v2.textContent = cut + '%';

    // Brevity slider: user's direct prompt-shortening behavior.
    // At 40% adoption, recover ~40% of the brevity pool.
    const savedFromBrevity = BREVITY_POOL * (brevity / 40);
    const savedFromCut = AVOIDABLE_POOL * (cut / 100);

    save1.textContent = savedFromBrevity.toFixed(2) + ' kg';
    save2.textContent = savedFromCut.toFixed(2) + ' kg';

    const projected = Math.max(0, BASELINE - savedFromBrevity - savedFromCut);
    const annual = projected * 52;
    const deltaPct = BASELINE > 0 ? ((projected - BASELINE) / BASELINE) * 100 : 0;

    projWeek.innerHTML = projected.toFixed(2) + ' <small>kg</small>';
    projWeekDelta.textContent = (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1) + '%';
    projYear.innerHTML = Math.round(annual) + ' <small>kg/yr</small>';
    projYearDelta.textContent = 'vs ' + Math.round(BASELINE_YEAR) + ' baseline';
  }
  s1.addEventListener('input', recalc);
  s2.addEventListener('input', recalc);
  recalc();
  `;
}

// ─── helpers ──────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTokensShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ─── STYLES (inlined from prototype) ─────────────────────

const STYLES = `
  :root {
    --paper:    #f7f5f0;
    --surface:  #ffffff;
    --ink-deep: #1a1611;
    --ink-mid:  #5a544b;
    --ink-soft: #8b7f74;
    --line:     #d9d4c9;
    --line-soft:#e8e4d9;
    --soot-0:   #eceae5;
    --soot-1:   #c4bfb5;
    --soot-2:   #8b7f74;
    --soot-3:   #3a332c;
    --soot-4:   #1a1611;
    --rust:     #8b4a2b;
    --rust-soft:#c97a4a;
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
  main { max-width: 1040px; margin: 0 auto; padding: 48px 28px 96px; }
  header.top { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid var(--line); padding-bottom: 14px; margin-bottom: 40px; }
  header.top .brand { font-family: var(--serif); font-size: 22px; letter-spacing: -0.01em; }
  header.top .brand span { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); letter-spacing: 0.04em; margin-left: 12px; text-transform: uppercase; }
  header.top .meta { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); letter-spacing: 0.06em; text-transform: uppercase; }

  section { margin-bottom: 72px; }
  section h2 { font-family: var(--mono); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-soft); margin: 0 0 20px; padding-bottom: 8px; border-bottom: 1px solid var(--line-soft); }

  .hero { display: grid; grid-template-columns: 1.3fr 1fr; gap: 40px; align-items: end; margin-bottom: 28px; }
  .hero .kg { font-family: var(--serif); font-weight: 400; font-size: 120px; line-height: 0.95; letter-spacing: -0.035em; color: var(--ink-deep); }
  .hero .kg .unit { font-family: var(--mono); font-size: 14px; color: var(--ink-soft); letter-spacing: 0.1em; text-transform: uppercase; display: block; margin-top: 10px; }
  .hero .pace { border-left: 1px solid var(--line); padding-left: 24px; }
  .hero .pace .label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; color: var(--ink-soft); text-transform: uppercase; margin-bottom: 6px; }
  .hero .pace .value { font-family: var(--serif); font-size: 36px; line-height: 1.1; color: var(--ink-deep); }
  .hero .pace .value small { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); letter-spacing: 0.05em; }
  .hero .pace .helper { margin-top: 14px; font-size: 12px; color: var(--ink-mid); }
  .hero .pace .helper .delta { font-family: var(--mono); color: var(--rust); font-weight: 600; }

  .sparkline-row { display: flex; align-items: center; gap: 16px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; color: var(--ink-mid); text-transform: uppercase; margin-top: 20px; }
  .sparkline { display: flex; align-items: flex-end; gap: 3px; height: 22px; }
  .sparkline .bar { width: 14px; background: var(--soot-3); border-radius: 1px; }
  .sparkline .bar.zero { background: var(--line); height: 2px !important; }
  .sparkline-row .labels { display: flex; gap: 5px; font-family: var(--mono); font-size: 10px; color: var(--ink-soft); }
  .sparkline-row .labels span { width: 14px; text-align: center; letter-spacing: 0; }

  /* ── Soot Calendar (GitHub-style year view) ── */
  .calendar.gh { margin-top: 36px; padding-top: 28px; border-top: 1px solid var(--line-soft); }
  .calendar.gh .cal-title {
    font-family: var(--serif); font-size: 20px; color: var(--ink-deep);
    letter-spacing: -0.01em; margin-bottom: 18px;
  }

  .calendar.gh .cal-main {
    display: flex; flex-direction: column; gap: 4px;
    overflow-x: auto;
  }
  .calendar.gh .cal-months {
    display: grid;
    grid-template-columns: repeat(53, 13px);
    gap: 0 2px;
    margin-left: 34px;
    height: 14px;
    font-family: var(--mono); font-size: 10px; color: var(--ink-soft);
    letter-spacing: 0.02em;
    position: relative;
  }
  .calendar.gh .cal-months span {
    grid-row: 1; white-space: nowrap; align-self: end;
  }

  .calendar.gh .cal-body { display: grid; grid-template-columns: 30px auto; gap: 6px; }
  .calendar.gh .cal-dows {
    display: grid; grid-template-rows: repeat(7, 13px); gap: 2px;
    font-family: var(--mono); font-size: 9px; color: var(--ink-soft);
    letter-spacing: 0.04em;
  }
  .calendar.gh .cal-dows span { display: flex; align-items: center; }

  .calendar.gh .cal-cells {
    display: grid;
    grid-template-rows: repeat(7, 13px);
    grid-auto-flow: column;
    grid-auto-columns: 13px;
    gap: 2px;
  }
  .calendar.gh .fcell {
    width: 13px; height: 13px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 2px;
    background: rgba(58, 51, 44, 0.05);    /* faint paper-grey tile, GitHub-empty analog */
    position: relative;
    cursor: default;
  }
  .calendar.gh .fcell svg { transition: transform 0.12s; }
  .calendar.gh .fcell[data-kg] { background: transparent; }
  .calendar.gh .fcell[data-kg]:hover { outline: 1px solid var(--rust); cursor: pointer; }
  .calendar.gh .fcell[data-kg]:hover svg { transform: scale(1.25); }
  .calendar.gh .fcell.empty { background: transparent; visibility: hidden; }
  .calendar.gh .fcell.blank { background: rgba(58, 51, 44, 0.05); }
  .calendar.gh .fcell.today { outline: 1px solid var(--rust); }

  .calendar.gh .cal-footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 14px;
    font-family: var(--mono); font-size: 10px; color: var(--ink-soft);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .calendar.gh .cal-footer .legend {
    display: flex; align-items: center; gap: 4px;
  }
  .calendar.gh .cal-footer .ramp-foot {
    display: inline-flex; align-items: center; justify-content: center;
    width: 13px; height: 13px;
  }

  /* ── Anatomy of a Turn ── */
  .flow { display: flex; flex-direction: column; align-items: stretch; max-width: 760px; margin: 0 auto; }
  .flow .stage {
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 14px 20px;
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 20px;
    align-items: center;
  }
  .flow .stage.cache { background: transparent; border-style: dashed; }

  .stage-head { display: flex; flex-direction: column; gap: 6px; }
  .stage-tag {
    font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
    text-transform: uppercase; color: var(--ink-soft);
    padding: 2px 7px; border: 1px solid var(--line);
    align-self: flex-start;
  }
  .stage-tag.cache { color: var(--ink-soft); border-color: var(--line); border-style: dashed; }
  .stage-tag.out { color: var(--rust); border-color: var(--rust); font-weight: 600; }
  .stage-tag.pay { color: var(--ink-deep); border-color: var(--ink-deep); }

  .stage-name { font-family: var(--serif); font-size: 16px; line-height: 1.2; color: var(--ink-deep); }

  .stage-body { display: grid; grid-template-columns: 80px 1fr 70px; gap: 14px; align-items: center; }
  .stage-num { font-family: var(--mono); font-size: 13px; color: var(--ink-deep); font-weight: 600; }
  .stage-num small { font-weight: 400; font-size: 10px; color: var(--ink-soft); letter-spacing: 0.08em; text-transform: uppercase; margin-left: 2px; }
  .stage-bar { height: 6px; background: var(--line-soft); overflow: hidden; }
  .stage-bar .fill { height: 100%; background: var(--ink-deep); transition: width 0.2s; }
  .stage-bar .fill.cache { background: var(--ink-soft); }
  .stage-bar .fill.out { background: var(--rust); }
  .stage-g { font-family: var(--serif); font-size: 17px; color: var(--ink-deep); text-align: right; letter-spacing: -0.01em; }
  .stage.cache .stage-g { color: var(--ink-soft); }
  .stage.out .stage-g { color: var(--rust); font-weight: 600; }
  .stage-note {
    grid-column: 1 / -1;
    font-family: var(--mono); font-size: 11px; color: var(--ink-soft);
    margin-top: 2px; letter-spacing: 0.02em; line-height: 1.5;
  }

  .flow .arrow {
    text-align: center; padding: 6px 0;
    font-family: var(--mono); font-size: 14px; color: var(--ink-soft);
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .flow .arrow-note { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
  .flow .arrow.loop { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding-top: 8px; }

  .total-turn {
    margin-top: 14px; padding: 14px 20px;
    background: var(--ink-deep); color: var(--paper);
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
  }
  .total-turn .total-g {
    font-family: var(--serif); font-size: 22px; letter-spacing: -0.01em;
    text-transform: none; color: var(--rust-soft);
  }

  .influences { margin-top: 32px; }
  .influences .inf-title {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
    text-transform: uppercase; color: var(--ink-soft); margin-bottom: 12px;
  }
  .influences .inf-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .influences .inf-cell {
    padding: 14px 16px;
    border-left: 2px solid var(--rust);
    background: var(--surface);
  }
  .influences .inf-key {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--rust); font-weight: 600; margin-bottom: 6px;
  }
  .influences .inf-body {
    font-family: var(--mono); font-size: 11px; color: var(--ink-mid);
    line-height: 1.55; letter-spacing: 0.02em;
  }

  /* ── Flow animation ── */
  .flow .stage, .flow .arrow, .flow .total-turn {
    transition: opacity 0.5s ease-out, transform 0.5s ease-out;
  }
  .flow.animated .stage,
  .flow.animated .arrow,
  .flow.animated .total-turn {
    opacity: 0;
    transform: translateY(10px);
  }
  .flow.animated .stage.in,
  .flow.animated .arrow.in,
  .flow.animated .total-turn.in {
    opacity: 1;
    transform: translateY(0);
  }

  /* Bar fills animate from 0 to target when their stage becomes visible */
  .stage-bar .fill {
    transform-origin: left;
    transition: transform 0.7s ease-out 0.2s;
  }
  .flow.animated .stage .stage-bar .fill {
    transform: scaleX(0);
  }
  .flow.animated .stage.in .stage-bar .fill {
    transform: scaleX(1);
  }
  /* Output bar fills slower — decode feels slow */
  .stage.out .stage-bar .fill { transition: transform 1.2s ease-out 0.15s; }

  /* Current stage glow */
  .stage.current {
    box-shadow: inset 0 0 0 2px var(--rust);
    transition: box-shadow 0.3s;
  }

  /* Model-processing arrow pulsing while output is rendering */
  .flow .arrow.pulse.processing .arrow-note {
    animation: arrow-blink 0.5s ease-in-out infinite;
  }
  @keyframes arrow-blink {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; color: var(--rust); }
  }

  /* Tool-call loop arrow keeps breathing subtly after animation */
  .flow .arrow.loop {
    animation: loop-breathe 3.5s ease-in-out infinite;
    animation-delay: 3s;
  }
  @keyframes loop-breathe {
    0%, 100% { opacity: 0.45; }
    50%      { opacity: 0.9; }
  }

  /* Replay button */
  .replay-btn {
    align-self: flex-end;
    margin-top: 16px;
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--ink-soft);
    background: transparent; border: 1px solid var(--line);
    padding: 6px 12px; cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .replay-btn:hover { color: var(--rust); border-color: var(--rust); }

  .tooltip { position: fixed; z-index: 40; background: var(--ink-deep); color: var(--paper); padding: 8px 10px; font-family: var(--mono); font-size: 11px; line-height: 1.5; border-radius: 3px; pointer-events: none; opacity: 0; transform: translate(-50%, -110%); transition: opacity 0.1s; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .tooltip.visible { opacity: 1; }
  .tooltip b { color: var(--rust-soft); font-weight: 400; }

  .replay-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 22px; flex-wrap: wrap; gap: 12px; }
  .replay-head .title { font-family: var(--serif); font-size: 24px; letter-spacing: -0.01em; }
  .replay-head .sub { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); letter-spacing: 0.08em; text-transform: uppercase; }

  .replay { display: grid; grid-template-columns: 1.4fr 1fr; gap: 40px; align-items: start; }
  .cumulative { position: sticky; top: 24px; background: var(--surface); border: 1px solid var(--line); padding: 16px 18px 22px; }
  .cumulative .cap { font-family: var(--mono); font-size: 10px; color: var(--ink-soft); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px; }
  .cumulative svg { width: 100%; height: 220px; display: block; }
  .cumulative .axis-x { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--ink-soft); margin-top: 6px; letter-spacing: 0.05em; }

  .notes .note { padding: 14px 0; border-bottom: 1px solid var(--line-soft); opacity: 0.35; transition: opacity 0.25s, transform 0.25s; transform: translateX(6px); }
  .notes .note.active { opacity: 1; transform: translateX(0); }
  .notes .note .ts { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); letter-spacing: 0.06em; margin-bottom: 3px; }
  .notes .note .what { font-family: var(--serif); font-size: 17px; line-height: 1.35; color: var(--ink-deep); }
  .notes .note .detail { font-family: var(--mono); font-size: 12px; color: var(--ink-mid); margin-top: 4px; }
  .notes .note .detail .accent { color: var(--rust); }

  .phantom { display: grid; grid-template-columns: 1.15fr 1fr; gap: 40px; align-items: start; }
  .bars { display: flex; flex-direction: column; gap: 16px; }
  .bar-row .lbl { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--mono); font-size: 11px; color: var(--ink-mid); letter-spacing: 0.06em; margin-bottom: 6px; }
  .bar-row .lbl .name { color: var(--ink-deep); text-transform: uppercase; font-weight: 600; }
  .bar-row .track { position: relative; height: 24px; background: var(--line-soft); border: 1px solid var(--line); }
  .bar-row .actual { height: 100%; background: var(--soot-3); position: relative; z-index: 1; }
  .bar-row .phantom-box { position: absolute; top: -3px; bottom: -3px; border: 1.5px dashed var(--rust); background: repeating-linear-gradient(135deg, transparent 0, transparent 4px, rgba(139,74,43,0.08) 4px, rgba(139,74,43,0.08) 8px); pointer-events: none; z-index: 0; }
  .bar-row .foot { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--ink-soft); margin-top: 4px; letter-spacing: 0.04em; }
  .bar-row .foot .phantom-note { color: var(--rust); }

  .whatif { background: var(--surface); border: 1px solid var(--line); padding: 24px 22px; }
  .whatif h3 { margin: 0 0 20px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-soft); font-weight: 600; }
  .slider-block { margin-bottom: 22px; }
  .slider-block .srow { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--mono); font-size: 12px; margin-bottom: 8px; color: var(--ink-mid); letter-spacing: 0.03em; }
  .slider-block .srow .val { font-family: var(--serif); font-size: 22px; color: var(--ink-deep); letter-spacing: -0.01em; line-height: 1; }
  .slider-block input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 3px; background: var(--line); outline: none; border-radius: 0; }
  .slider-block input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--rust); cursor: pointer; }
  .slider-block input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--rust); border: none; cursor: pointer; }
  .slider-block .save { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); margin-top: 6px; letter-spacing: 0.04em; }
  .slider-block .save b { color: var(--ink-deep); font-weight: 600; }

  .projection { margin-top: 14px; padding-top: 18px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .projection .pcell .k { font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--ink-soft); }
  .projection .pcell .v { font-family: var(--serif); font-size: 28px; line-height: 1.2; color: var(--ink-deep); letter-spacing: -0.01em; }
  .projection .pcell .v small { font-family: var(--mono); font-size: 11px; color: var(--rust); letter-spacing: 0.04em; }

  .skills-top, .skills-rest { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .skills-rest { gap: 16px; }
  .section-divider { font-family: var(--mono); font-size: 10px; color: var(--ink-soft); letter-spacing: 0.2em; text-transform: uppercase; text-align: center; margin: 32px 0 20px; display: flex; align-items: center; gap: 16px; }
  .section-divider::before, .section-divider::after { content: ''; flex: 1; height: 1px; background: var(--line-soft); }
  .skill-card { background: var(--surface); border: 1px solid var(--line); padding: 22px 22px 18px; position: relative; display: flex; flex-direction: column; }
  .skill-card.featured { border-left: 3px solid var(--rust); }
  .skill-card .cat { font-family: var(--mono); font-size: 10px; color: var(--ink-soft); letter-spacing: 0.18em; text-transform: uppercase; }
  .skill-card .name { font-family: var(--serif); font-size: 22px; line-height: 1.2; margin: 4px 0 14px; letter-spacing: -0.01em; max-width: 70%; }
  .skill-card .name.smaller { font-size: 18px; }
  .skill-card .pair { font-family: var(--mono); font-size: 12px; line-height: 1.6; background: var(--paper); padding: 10px 12px; border-left: 2px solid var(--line); }
  .skill-card .pair .line { padding: 2px 0; display: flex; gap: 10px; align-items: flex-start; }
  .skill-card .pair .mark { font-weight: 600; font-size: 13px; flex-shrink: 0; width: 14px; }
  .skill-card .pair .mark.bad  { color: var(--ink-soft); }
  .skill-card .pair .mark.good { color: var(--rust); }
  .skill-card .pair .text.bad  { color: var(--ink-soft); }
  .skill-card .pair .text.good { color: var(--ink-deep); }
  .skill-card .why { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line-soft); letter-spacing: 0.02em; line-height: 1.55; }

  .reality-box { background: var(--surface); border: 1px solid var(--line); padding: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
  .reality-table { font-family: var(--mono); font-size: 13px; }
  .reality-table .rrow { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--line-soft); letter-spacing: 0.03em; }
  .reality-table .rrow:last-child { border-bottom: none; }
  .reality-table .rk { color: var(--ink-soft); text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; }
  .reality-table .rv { color: var(--ink-deep); font-size: 15px; }
  .reality-table .rv .flag { background: var(--ink-deep); color: var(--paper); font-size: 10px; letter-spacing: 0.1em; padding: 2px 6px; margin-right: 6px; text-transform: uppercase; }
  .reality-body { font-size: 13.5px; line-height: 1.65; color: var(--ink-mid); border-left: 2px solid var(--rust); padding-left: 20px; }
  .reality-body strong { color: var(--ink-deep); font-weight: 600; }
  .reality-body .quiet { color: var(--ink-soft); font-size: 12px; margin-top: 10px; display: block; }

  footer.bottom { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--ink-soft); letter-spacing: 0.08em; text-transform: uppercase; }

  @media (max-width: 820px) {
    .hero { grid-template-columns: 1fr; }
    .hero .kg { font-size: 88px; }
    .replay { grid-template-columns: 1fr; }
    .cumulative { position: static; }
    .phantom { grid-template-columns: 1fr; }
    .reality-box { grid-template-columns: 1fr; }
    .skills-top, .skills-rest { grid-template-columns: 1fr; }
    .skill-card .name { max-width: 100%; padding-right: 70px; }
    .flow .stage { grid-template-columns: 1fr; gap: 12px; }
    .stage-body { grid-template-columns: 1fr; }
    .influences .inf-grid { grid-template-columns: 1fr; }
  }
`;
