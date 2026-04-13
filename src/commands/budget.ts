import { loadConfig, updateConfig } from "../core/config.js";
import { ClaudeAdapter } from "../adapters/claude/index.js";
import { formatCO2, getEmissionLevel } from "../core/tone.js";
import { colors, BAR, colorForLevel } from "../renderer/colors.js";

export async function budgetCommand(options: {
  set?: string;
}): Promise<void> {
  if (options.set) {
    const grams = parseFloat(options.set.replace(/g$/i, ""));
    if (isNaN(grams) || grams <= 0) {
      console.log(colors.red("  Invalid budget. Use: co2de budget --set 50g"));
      return;
    }
    updateConfig({ daily_budget_grams: grams });
    console.log(`  Daily budget set to ${formatCO2(grams)} CO2.`);
    return;
  }

  const config = loadConfig();
  const budget = config.daily_budget_grams;

  if (!budget) {
    console.log(colors.dim("  No daily budget set."));
    console.log(colors.dim("  Set one with: co2de budget --set 50g"));
    return;
  }

  // Get today's usage
  const adapter = new ClaudeAdapter();
  const now = new Date();
  const todayStart = new Date(now.toISOString().slice(0, 10));
  const sessions = await adapter.listSessions(todayStart, now);

  const used = sessions.reduce((s, ses) => s + ses.co2_grams, 0);
  const percentage = Math.min((used / budget) * 100, 100);
  const remaining = Math.max(0, budget - used);

  console.log(colors.bold(`\n  Daily Carbon Budget: ${formatCO2(budget)} CO2`));

  // Budget bar
  const barWidth = 30;
  const filled = Math.round((percentage / 100) * barWidth);
  const empty = barWidth - filled;
  const level = getEmissionLevel(used);
  const barColor = percentage >= 80 ? colors.red : percentage >= 50 ? colors.yellow : colors.green;

  console.log(
    `  Used   ${barColor(BAR.filled.repeat(filled))}${colors.dim(BAR.empty.repeat(empty))}  ${percentage.toFixed(0)}%  ${formatCO2(used)}`,
  );

  // Time-of-day breakdown
  const morning = sessions
    .filter((s) => new Date(s.timestamp).getHours() < 12)
    .reduce((sum, s) => sum + s.co2_grams, 0);
  const afternoon = sessions
    .filter((s) => {
      const h = new Date(s.timestamp).getHours();
      return h >= 12 && h < 18;
    })
    .reduce((sum, s) => sum + s.co2_grams, 0);
  const evening = sessions
    .filter((s) => new Date(s.timestamp).getHours() >= 18)
    .reduce((sum, s) => sum + s.co2_grams, 0);

  if (sessions.length > 0) {
    console.log("");
    const maxPeriod = Math.max(morning, afternoon, evening, 1);
    const mBar = colors.dim(BAR.filled.repeat(Math.round((morning / maxPeriod) * 8)));
    const aBar = colors.yellow(BAR.filled.repeat(Math.round((afternoon / maxPeriod) * 8)));
    const eBar = colors.magenta(BAR.filled.repeat(Math.round((evening / maxPeriod) * 8)));
    console.log(`  morning ${mBar} ${formatCO2(morning)}`);
    console.log(`  afternoon ${aBar} ${formatCO2(afternoon)}`);
    console.log(`  evening ${eBar} ${formatCO2(evening)}`);
  }

  console.log("");
  console.log(`  Remaining: ${formatCO2(remaining)}`);
  console.log("");
}
