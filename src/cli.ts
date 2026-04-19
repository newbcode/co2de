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
import { tipsCommand } from "./commands/tips.js";
import { traceCommand } from "./commands/trace.js";
import { dashboardCommand } from "./commands/dashboard.js";
import { serveCommand } from "./commands/serve.js";
import { readmeCommand } from "./commands/readme.js";
import { footprintCommand } from "./commands/footprint.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("co2de")
    .description("Track the carbon cost of vibe coding, one token at a time.")
    .version("0.1.0");

  program.action(defaultCommand);

  // Explicit subcommand alias so `co2de all` works as global-scope entry
  // point without clashing with subcommand `--all` flags in commander v14.
  program.command("all")
    .description("Default view aggregated across every project (alias for co2de --all intent)")
    .action(() => defaultCommand({ all: true }));

  program.command("why")
    .description("Explain WHY this much CO\u2082 was emitted — full calculation breakdown")
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
    .description("GitHub-style contribution calendar for CO\u2082")
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
    .description("Generate README carbon badge (self-hosted SVG)")
    .option("--type <type>", "Badge type: pace | lean | stable | concise | disclosed | all", "pace")
    .option("--save", "Write SVG file(s) to .co2de/")
    .option("--inject", "Auto-insert/update badge block in README.md (implies --save)")
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

  program.command("tips [category]")
    .description("Prompt-craft playbook — concrete rewrites that cut tokens")
    .action(tipsCommand);

  program.command("trace [sessionId]")
    .description("Per-turn emission timeline for a session (default: latest)")
    .action(traceCommand);

  program.command("dashboard")
    .description("Generate interactive Soot Ledger HTML dashboard (default: current project)")
    .option("--month", "Past 30 days (default: past 7)")
    .option("--all", "All projects combined (default: current project only)")
    .option("--demo", "Use demo data with a filled 30-day calendar")
    .option("--no-open", "Do not auto-open in browser")
    .action(dashboardCommand);

  program.command("serve")
    .description("Start a local server that live-reloads the Soot Ledger (default: current project)")
    .option("--port <port>", "Port number (default: 4869)", "4869")
    .option("--month", "Past 30 days (default: past 7)")
    .option("--all", "All projects combined (default: current project only)")
    .option("--demo", "Serve demo data with a filled 30-day calendar")
    .option("--no-open", "Do not auto-open in browser")
    .action(serveCommand);

  program.command("readme")
    .description("One-shot: generate badges + calendar + disclosure page, inject block into README.md")
    .option("--show <level>", "Privacy: full | bucketed | weekly | disclosed", "bucketed")
    .option("--remove", "Remove the co2de block from README.md")
    .action(readmeCommand);

  program.command("footprint")
    .description("Year-view carbon footprint calendar in terminal (52 weeks × 7 days)")
    .option("--all", "All projects combined (default: current project only)")
    .option("--style <name>", "Visual style: footprint | paw | blocks | pollution", "footprint")
    .option("--image", "Force inline image (PNG via iTerm2/WezTerm/Kitty protocol)")
    .option("--ascii", "Force ASCII heatmap (skip emoji and image)")
    .action(footprintCommand);

  return program;
}
