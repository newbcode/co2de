import { execSync } from "node:child_process";
import { ClaudeAdapter } from "../adapters/claude.js";
import { generateHTMLReport } from "../export/html-report.js";
import { calculateSavings } from "../engine/savings-tracker.js";
import { calculateMetaphors, getEnergyPerToken } from "../engine/carbon-calculator.js";
import { loadConfig } from "../core/config.js";
import { colors } from "../renderer/colors.js";
import { PUE } from "../core/constants.js";
import type { TokenUsage, ReportData } from "../core/types.js";

export async function exportCommand(options: {
  today?: boolean;
  week?: boolean;
  month?: boolean;
  detail?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const adapter = new ClaudeAdapter(config.region);
  const now = new Date();
  let from: Date;
  let period: string;

  if (options.month) {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
    period = "Past 30 Days";
  } else if (options.today) {
    from = new Date(now.toISOString().slice(0, 10));
    period = "Today";
  } else {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
    period = "Past 7 Days";
  }

  const sessions = await adapter.listSessions(from, now);

  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions found for this period."));
    return;
  }

  // Gather all token entries for savings & analysis
  const allEntries: TokenUsage[] = [];
  for (const s of sessions) {
    const entries = await adapter.getSessionUsage(s.id);
    allEntries.push(...entries);
  }

  // Compute aggregates
  let totalCO2 = 0;
  let totalTokens = 0;
  let totalEnergyWh = 0;
  for (const s of sessions) {
    totalCO2 += s.co2_grams;
    totalTokens += s.total_tokens;
  }
  for (const e of allEntries) {
    const tokens = e.input_tokens + e.output_tokens + e.cache_read_tokens + e.cache_write_tokens;
    totalEnergyWh += tokens * getEnergyPerToken(e.model) * PUE;
  }

  const savings = calculateSavings(allEntries, config.region);
  const metaphors = calculateMetaphors(totalCO2);

  const reportData: ReportData = {
    sessions,
    tokenEntries: allEntries,
    savings,
    config,
    metaphors,
    totalCO2,
    totalTokens,
    totalEnergyWh,
    period,
    generatedAt: now.toISOString(),
  };

  const outputDir = process.cwd();
  const filePath = generateHTMLReport(reportData, outputDir, options.detail ?? false);

  console.log(colors.bold("\n  co2de — HTML Report Generated\n"));
  console.log(`  File: ${filePath}`);
  console.log(`  Sessions: ${sessions.length}`);
  console.log(`  Period: ${period}`);
  console.log("");

  // Auto-open in browser
  try {
    if (process.platform === "darwin") {
      execSync(`open "${filePath}"`);
      console.log(colors.green("  Opened in browser."));
    } else if (process.platform === "linux") {
      execSync(`xdg-open "${filePath}"`);
      console.log(colors.green("  Opened in browser."));
    } else {
      console.log(colors.dim(`  Open ${filePath} in your browser.`));
    }
  } catch {
    console.log(colors.dim(`  Open ${filePath} in your browser.`));
  }
  console.log("");
}
