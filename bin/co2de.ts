import { Command } from "commander";
import { ClaudeAdapter } from "../src/adapters/claude/index.js";
import { calculateCarbon } from "../src/engine/carbon-calculator.js";
import { loadConfig } from "../src/core/config.js";
import { renderSession } from "../src/renderer/terminal.js";
import { reportCommand } from "../src/commands/report.js";
import { whyCommand } from "../src/commands/why.js";
import { compareCommand } from "../src/commands/compare.js";
import { logCommand } from "../src/commands/log.js";
import { budgetCommand } from "../src/commands/budget.js";
import { heatmapCommand } from "../src/commands/heatmap.js";
import { dashboardCommand } from "../src/commands/dashboard.js";
import { configCommand } from "../src/commands/config-cmd.js";
import { initCommand } from "../src/commands/init.js";
import { savingsCommand } from "../src/commands/savings.js";
import { projectCommand } from "../src/commands/project.js";
import { badgeCommand } from "../src/commands/badge.js";
import { offsetCommand } from "../src/commands/offset.js";
import { auditCommand } from "../src/commands/audit.js";
import { exportCommand } from "../src/commands/export.js";
import type { TokenUsage } from "../src/core/types.js";

const program = new Command();

program
  .name("co2de")
  .description("Track the carbon cost of vibe coding, one token at a time.")
  .version("0.1.0");

// Default: show last session summary
program.action(async () => {
  const adapter = new ClaudeAdapter();
  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);

  const sessions = await adapter.listSessions(dayAgo, now);
  if (sessions.length === 0) {
    console.log("  No recent sessions. Start a Claude CLI session first.");
    return;
  }

  const latest = sessions[0];
  const entries = await adapter.getSessionUsage(latest.id);

  if (entries.length === 0) {
    console.log("  No token data for the latest session.");
    return;
  }

  // Aggregate into a single usage for display
  const config = loadConfig();
  const aggregated: TokenUsage = {
    input_tokens: entries.reduce((s, e) => s + e.input_tokens, 0),
    output_tokens: entries.reduce((s, e) => s + e.output_tokens, 0),
    cache_read_tokens: entries.reduce((s, e) => s + e.cache_read_tokens, 0),
    cache_write_tokens: entries.reduce((s, e) => s + e.cache_write_tokens, 0),
    model: entries[entries.length - 1].model,
    provider: "claude",
    timestamp: entries[0].timestamp,
    session_id: latest.id,
  };

  const result = calculateCarbon(aggregated, config.region);
  console.log("");
  console.log(renderSession(result));
  console.log("");
});

program
  .command("report")
  .description("Detailed report with scale comparisons")
  .option("--today", "Show today's report")
  .option("--week", "Show past 7 days")
  .action(reportCommand);

program
  .command("why")
  .description("Explain WHY this much CO2 was emitted — full calculation breakdown")
  .action(whyCommand);

program
  .command("compare")
  .description("Hand coding vs AI coding — the core message")
  .action(compareCommand);

program
  .command("log")
  .description("Git-style session history")
  .action(logCommand);

program
  .command("budget")
  .description("Daily carbon budget tracker")
  .option("--set <grams>", "Set daily budget (e.g., 50g)")
  .action(budgetCommand);

program
  .command("heatmap")
  .description("GitHub-style contribution calendar for CO2")
  .action(heatmapCommand);

program
  .command("dashboard")
  .description("7-day cumulative chart")
  .action(dashboardCommand);

program
  .command("config [action] [key] [value]")
  .description("Configuration management (show | set <key> <value>)")
  .action(configCommand);

program
  .command("audit")
  .description("Carbon efficiency audit — detect avoidable waste")
  .option("--week", "Audit past 7 days")
  .action(auditCommand);

program
  .command("savings")
  .description("Track carbon saved from smart choices")
  .action(savingsCommand);

program
  .command("project")
  .description("Total carbon footprint for this project")
  .action(projectCommand);

program
  .command("badge")
  .description("Generate README carbon badge")
  .action(badgeCommand);

program
  .command("offset")
  .description("Carbon offset guide + log offset actions")
  .option("--log <note>", "Log an offset action")
  .action(offsetCommand);

program
  .command("export")
  .description("Generate self-contained HTML report")
  .option("--today", "Today only")
  .option("--week", "Past 7 days (default)")
  .option("--month", "Past 30 days")
  .action(exportCommand);

program
  .command("init")
  .description("Auto-patch statusline + initialize config")
  .action(initCommand);

program.parse();
