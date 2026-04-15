import { execSync } from "node:child_process";
import { generateHTMLReport } from "../export/html-report.js";
import { calculateSavings } from "../engine/savings-tracker.js";
import { calculateMetaphors, getEnergyPerToken } from "../engine/carbon-calculator.js";
import { colors } from "../renderer/colors.js";
import { PUE } from "../core/constants.js";
import type { ReportData } from "../core/types.js";
import { createContext, daysAgo, todayStart, collectAllEntries } from "./shared.js";

export async function exportCommand(options: {
  today?: boolean;
  week?: boolean;
  month?: boolean;
  detail?: boolean;
}): Promise<void> {
  const { config, adapter } = createContext();
  const now = new Date();
  let from: Date;
  let period: string;

  if (options.month) {
    from = daysAgo(30);
    period = "Past 30 Days";
  } else if (options.today) {
    from = todayStart();
    period = "Today";
  } else {
    from = daysAgo(7);
    period = "Past 7 Days";
  }

  const sessions = await adapter.listSessions(from, now);

  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions found for this period."));
    return;
  }

  const allEntries = await collectAllEntries(adapter, sessions);

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
