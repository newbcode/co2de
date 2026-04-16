import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectAllSessions, collectProjectSessions } from "../adapters/claude.js";
import { colors } from "../renderer/colors.js";
import { createContext, daysAgo } from "./shared.js";
import {
  buildDashboardData,
  pickFeaturedSession,
} from "../dashboard/data.js";
import { buildDemoDashboardData } from "../dashboard/demo-data.js";
import { generateDashboardHTML } from "../dashboard/html-dashboard.js";

/**
 * co2de dashboard — generate a static Soot Ledger HTML for browser viewing.
 *
 * Mirrors the export pattern: builds a self-contained HTML file with all
 * data baked in, writes to cwd, and opens in the system browser.
 * Unlike `co2de export` (a formal report), the dashboard is for
 * exploration — interactive what-if sliders, per-turn drill-down.
 */
export async function dashboardCommand(options: {
  month?: boolean;
  open?: boolean;
  demo?: boolean;
  all?: boolean;
}): Promise<void> {
  const { config, adapter } = createContext();
  let data;
  let summaryLine: string;

  if (options.demo) {
    data = buildDemoDashboardData(config.region);
    summaryLine = `  Source:   demo data (30-day filled calendar)`;
  } else {
    const now = new Date();
    const from = options.month ? daysAgo(30) : daysAgo(7);

    // Default: this project only. --all overrides to include every project.
    const projectPath = process.cwd();
    const sessions = options.all
      ? collectAllSessions(from, now, config.region)
      : collectProjectSessions(projectPath, from, now, config.region);

    if (sessions.length === 0) {
      if (options.all) {
        console.log(colors.dim("  No sessions in the requested period."));
      } else {
        console.log(colors.dim("  No sessions for this project in the requested period."));
        console.log(colors.dim("  Tip: run in the project directory, or use  --all  for every project."));
      }
      console.log(colors.dim("  Or  co2de dashboard --demo  to see a filled example."));
      return;
    }

    const featured = pickFeaturedSession(sessions);
    if (!featured) {
      console.log(colors.dim("  No featured session candidates."));
      return;
    }

    const turns = await adapter.getSessionUsage(featured.sessionId);
    if (turns.length === 0) {
      console.log(colors.dim("  Featured session has no turns."));
      return;
    }

    data = buildDashboardData(sessions, featured, turns, config.region);
    const scope = options.all ? "all projects" : featured.project;
    summaryLine = `  Scope:    ${scope} · ${sessions.length} sessions · ${turns.length} turns in featured`;
  }

  const html = generateDashboardHTML(data);
  const outPath = join(process.cwd(), "co2de-dashboard.html");
  writeFileSync(outPath, html);

  console.log(colors.bold("\n  co2de dashboard\n"));
  console.log(`  File:     ${outPath}`);
  console.log(`  Period:   ${data.periodLabel}`);
  console.log(summaryLine);
  console.log("");

  if (options.open !== false) {
    try {
      if (process.platform === "darwin") execSync(`open "${outPath}"`);
      else if (process.platform === "linux") execSync(`xdg-open "${outPath}"`);
      else console.log(colors.dim(`  Open ${outPath} in your browser.`));
    } catch {
      console.log(colors.dim(`  Open ${outPath} in your browser.`));
    }
  }
  console.log("");
}
