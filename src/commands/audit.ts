import { ClaudeAdapter } from "../adapters/claude.js";
import {
  analyzeModelUsage,
  analyzeContextGrowth,
  analyzeCacheUtilization,
  analyzeToolUsage,
} from "../engine/analyzers.js";
import { loadConfig } from "../core/config.js";
import { colors } from "../renderer/colors.js";
import {
  fmtCO2,
  coloredCO2,
  precisionBar,
  ansiPadEnd,
  sectionHeader,
} from "../renderer/format.js";
import type { AuditFinding } from "../core/types.js";

// ─── Severity Helpers ───────────────────────────────────

const SEV_ORDER: Record<AuditFinding["severity"], number> = { high: 0, medium: 1, low: 2 };

function sevDots(severity: AuditFinding["severity"]): string {
  if (severity === "high") return colors.red("●●●");
  if (severity === "medium") return colors.yellow("●●");
  return colors.dim("●");
}

function sevColor(severity: AuditFinding["severity"]): (s: string) => string {
  if (severity === "high") return colors.red;
  if (severity === "medium") return colors.yellow;
  return colors.dim;
}

// ─── Column Widths ──────────────────────────────────────

const COL_SEV = 5;
const COL_PATTERN = 22;
const COL_POTENTIAL = 10;

// ─── Command ────────────────────────────────────────────

export async function auditCommand(options: {
  week?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const adapter = new ClaudeAdapter(config.region);
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - (options.week ? 7 : 1));

  const sessions = await adapter.listSessions(from, now);
  if (sessions.length === 0) {
    console.log(colors.dim("  No recent sessions to audit."));
    return;
  }

  // When --week, merge all session entries; otherwise analyze only the latest
  let entries: import("../core/types.js").TokenUsage[] = [];
  let sessionFilePaths: string[] = [];
  let auditLabel: string;

  if (options.week) {
    for (const s of sessions) {
      const sessionEntries = await adapter.getSessionUsage(s.id);
      entries.push(...sessionEntries);
      const fp = adapter.findSessionFile(s.id);
      if (fp) sessionFilePaths.push(fp);
    }
    auditLabel = `${sessions.length} sessions (7 days)`;
  } else {
    const latest = sessions[0];
    entries = await adapter.getSessionUsage(latest.id);
    const fp = adapter.findSessionFile(latest.id);
    if (fp) sessionFilePaths.push(fp);
    auditLabel = `session ${latest.id.slice(0, 7)}`;
  }

  if (entries.length === 0) {
    console.log(colors.dim("  No token data to analyze."));
    return;
  }

  // ── Run analyzers ─────────────────────────────────────
  const findings: AuditFinding[] = [];

  const modelFinding = analyzeModelUsage(entries, config.region);
  if (modelFinding) findings.push(modelFinding);

  const contextFinding = analyzeContextGrowth(entries, config.region);
  if (contextFinding) findings.push(contextFinding);

  const cacheFinding = analyzeCacheUtilization(entries, config.region);
  if (cacheFinding) findings.push(cacheFinding);

  for (const sessionFilePath of sessionFilePaths) {
    const toolFinding = analyzeToolUsage(sessionFilePath, config.region);
    if (toolFinding) findings.push(toolFinding);
  }

  // ── Compute totals ────────────────────────────────────
  const totalCO2 = sessions.reduce((s, ses) => s + ses.co2_grams, 0);
  const rawAvoidable = findings.reduce((s, f) => s + f.potential_savings_grams, 0);
  const avoidable = Math.min(rawAvoidable, totalCO2 * 0.8);
  const pct = totalCO2 > 0 ? (avoidable / totalCO2) * 100 : 0;

  // ── Header ────────────────────────────────────────────
  console.log(sectionHeader(
    "CARBON AUDIT \u2014 Efficiency Analysis",
    auditLabel,
  ));
  console.log("");

  if (findings.length === 0) {
    console.log(colors.green("  No efficiency issues found. Nice work!"));
    console.log("");
    return;
  }

  // ── Sort findings: high → medium → low ────────────────
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

  // ── Table header ──────────────────────────────────────
  console.log(`  ${colors.bold("FINDINGS")}`);
  const hdrSev = ansiPadEnd(colors.dim("SEV"), COL_SEV);
  const hdrPat = ansiPadEnd(colors.dim("PATTERN"), COL_PATTERN);
  const hdrPot = ansiPadEnd(colors.dim("POTENTIAL"), COL_POTENTIAL);
  const hdrDesc = colors.dim("DESCRIPTION");
  console.log(`  ${hdrSev}${hdrPat}${hdrPot}${hdrDesc}`);
  console.log(
    colors.dim(`  ${"───".padEnd(COL_SEV)}${"───────────────────".padEnd(COL_PATTERN)}${"────────".padEnd(COL_POTENTIAL)}${"─────────────────────────"}`),
  );

  // ── Rows ──────────────────────────────────────────────
  for (const f of findings) {
    const dots = ansiPadEnd(sevDots(f.severity), COL_SEV);
    const pattern = ansiPadEnd(colors.bold(f.pattern), COL_PATTERN);
    const savingsStr = sevColor(f.severity)(`-${fmtCO2(f.potential_savings_grams)}`);
    const potential = ansiPadEnd(savingsStr, COL_POTENTIAL);
    console.log(`  ${dots}${pattern}${potential}${f.description}`);
  }

  // ── Summary bar ───────────────────────────────────────
  console.log("");
  console.log(
    `  ${colors.bold("TOTAL POTENTIAL SAVINGS:")} ${coloredCO2(avoidable)} (${pct.toFixed(0)}% of session)`,
  );

  const barWidth = 22;
  const bar = precisionBar(avoidable, totalCO2, barWidth, colors.yellow);
  console.log(`  ${bar} ${pct.toFixed(0)}% recoverable`);

  // ── Tip ───────────────────────────────────────────────
  console.log("");
  console.log(
    colors.dim("  TIP: Run `co2de compare` to see AI vs hand-coding impact."),
  );
  console.log("");
}
