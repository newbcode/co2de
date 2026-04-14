import { Command } from "commander";
import { defaultCommand } from "./commands/default.js";
import { whyCommand } from "./commands/why.js";
import { compareCommand } from "./commands/compare.js";
import { logCommand } from "./commands/log.js";
import { budgetCommand } from "./commands/budget.js";
import { heatmapCommand } from "./commands/heatmap.js";
import { configCommand } from "./commands/config-cmd.js";
import { initCommand } from "./commands/init.js";
import { savingsCommand } from "./commands/savings.js";
import { badgeCommand } from "./commands/badge.js";

import { auditCommand } from "./commands/audit.js";
import { exportCommand } from "./commands/export.js";
import { weeklyCommand } from "./commands/weekly.js";
import { statuslineCommand } from "./commands/statusline.js";
import { usageCommand } from "./commands/usage.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("co2de")
    .description("Track the carbon cost of vibe coding, one token at a time.")
    .version("0.1.0");

  program.action(defaultCommand);

  program.command("why")
    .description("Explain WHY this much CO2 was emitted — full calculation breakdown")
    .action(whyCommand);

  program.command("compare")
    .description("Hand coding vs AI coding — the core message")
    .action(compareCommand);

  program.command("log")
    .description("Git-style session history")
    .action(logCommand);

  program.command("budget")
    .description("Daily carbon budget tracker")
    .option("--set <grams>", "Set daily budget (e.g., 50g)")
    .action(budgetCommand);

  program.command("heatmap")
    .description("GitHub-style contribution calendar for CO2")
    .action(heatmapCommand);

  program.command("config [action] [key] [value]")
    .description("Configuration management (show | set <key> <value>)")
    .action(configCommand);

  program.command("audit")
    .description("Carbon efficiency audit — detect avoidable waste")
    .option("--week", "Audit past 7 days")
    .action(auditCommand);

  program.command("savings")
    .description("Track carbon saved from smart choices")
    .action(savingsCommand);

  program.command("badge")
    .description("Generate README carbon badge")
    .option("--inject", "Auto-insert/update badge in README.md")
    .action(badgeCommand);


  program.command("export")
    .description("Generate self-contained HTML report")
    .option("--today", "Today only")
    .option("--week", "Past 7 days (default)")
    .option("--month", "Past 30 days")
    .option("--detail", "Include session table, savings, methodology (ESG/audit)")
    .action(exportCommand);

  program.command("init")
    .description("Auto-patch statusline + initialize config")
    .action(initCommand);

  program.command("weekly")
    .description("Weekly carbon report — day-by-day breakdown")
    .action(weeklyCommand);

  program.command("statusline")
    .description("Compact status line output for IDE integration")
    .action(statuslineCommand);

  program.command("usage")
    .description("Detailed token usage report — Emission Ledger")
    .option("--all", "All time")
    .option("--week", "Past 7 days (default)")
    .option("--month", "Past 30 days")
    .action(usageCommand);

  return program;
}
