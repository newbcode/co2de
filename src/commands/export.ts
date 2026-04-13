import { execSync } from "node:child_process";
import { ClaudeAdapter } from "../adapters/claude/index.js";
import { generateHTMLReport } from "../export/html-report.js";
import { colors } from "../renderer/colors.js";

export async function exportCommand(options: {
  today?: boolean;
  week?: boolean;
  month?: boolean;
}): Promise<void> {
  const adapter = new ClaudeAdapter();
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
    // Default: week
    from = new Date(now);
    from.setDate(from.getDate() - 7);
    period = "Past 7 Days";
  }

  const sessions = await adapter.listSessions(from, now);

  if (sessions.length === 0) {
    console.log(colors.dim("  No sessions found for this period."));
    return;
  }

  const outputDir = process.cwd();
  const filePath = generateHTMLReport(sessions, outputDir, period);

  console.log(colors.bold("\n\u{1F4A8} co2de — HTML Report Generated\n"));
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
