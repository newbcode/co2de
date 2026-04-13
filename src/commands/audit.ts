import { ClaudeAdapter } from "../adapters/claude/index.js";
import {
  listProjectDirs,
  listSessionFiles,
} from "../adapters/claude/jsonl-parser.js";
import { analyzeModelUsage } from "../analyzers/model-analyzer.js";
import { analyzeContextGrowth } from "../analyzers/context-analyzer.js";
import { analyzeCacheUtilization } from "../analyzers/cache-analyzer.js";
import { analyzeToolUsage } from "../analyzers/tool-analyzer.js";
import { loadConfig } from "../core/config.js";
import { formatCO2 } from "../core/tone.js";
import { colors } from "../renderer/colors.js";
import type { AuditFinding } from "../core/types.js";

export async function auditCommand(options: {
  week?: boolean;
}): Promise<void> {
  const adapter = new ClaudeAdapter();
  const config = loadConfig();
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - (options.week ? 7 : 1));

  const sessions = await adapter.listSessions(from, now);
  if (sessions.length === 0) {
    console.log(colors.dim("  No recent sessions to audit."));
    return;
  }

  // Analyze the most recent session (or aggregate for --week)
  const latest = sessions[0];
  const entries = await adapter.getSessionUsage(latest.id);

  if (entries.length === 0) {
    console.log(colors.dim("  No token data to analyze."));
    return;
  }

  // Find the session file for tool analysis
  let sessionFilePath = "";
  for (const dir of listProjectDirs()) {
    for (const file of listSessionFiles(dir)) {
      if (file.includes(latest.id)) {
        sessionFilePath = file;
        break;
      }
    }
    if (sessionFilePath) break;
  }

  // Run all analyzers
  const findings: AuditFinding[] = [];

  const modelFinding = analyzeModelUsage(entries, config.region);
  if (modelFinding) findings.push(modelFinding);

  const contextFinding = analyzeContextGrowth(entries);
  if (contextFinding) findings.push(contextFinding);

  const cacheFinding = analyzeCacheUtilization(entries);
  if (cacheFinding) findings.push(cacheFinding);

  if (sessionFilePath) {
    const toolFinding = analyzeToolUsage(sessionFilePath);
    if (toolFinding) findings.push(toolFinding);
  }

  // Display
  const totalCO2 = latest.co2_grams;
  // Cap avoidable at total CO2 — savings can't exceed actual emissions
  const rawAvoidable = findings.reduce((s, f) => s + f.potential_savings_grams, 0);
  const avoidable = Math.min(rawAvoidable, totalCO2 * 0.8); // max 80% avoidable

  console.log(colors.bold(`\n\u{1F4A8} co2de — Carbon Efficiency Audit`));
  console.log(colors.dim(`Session: ${latest.id.slice(0, 7)} (${latest.model})`));
  console.log("");
  console.log(`  Total: ${formatCO2(totalCO2)} CO2  |  Avoidable: ~${formatCO2(avoidable)} (${totalCO2 > 0 ? ((avoidable / totalCO2) * 100).toFixed(0) : 0}%)`);
  console.log("");

  if (findings.length === 0) {
    console.log(colors.green("  No efficiency issues found. Nice work!"));
  } else {
    console.log(colors.bold("FINDINGS:\n"));

    // Sort by severity
    const severityOrder = { high: 0, medium: 1, low: 2 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    for (const f of findings) {
      const icon =
        f.severity === "high" ? "\u{1F534}" :
        f.severity === "medium" ? "\u{1F7E1}" :
        "\u{26AA}";
      const savingsStr = formatCO2(f.potential_savings_grams);

      console.log(`  ${icon} ${colors.bold(f.pattern)}${" ".repeat(Math.max(1, 40 - f.pattern.length))}-${savingsStr} possible`);
      console.log(`     ${f.description}`);
      console.log(colors.dim(`     Suggestion: ${f.suggestion}`));
      console.log("");
    }

    const optimized = totalCO2 - avoidable;
    console.log(`OPTIMIZED ESTIMATE: ${formatCO2(Math.max(0, optimized))} CO2 (vs ${formatCO2(totalCO2)} actual)`);
  }

  console.log("");
}
