import { loadConfig, updateConfig } from "../core/config.js";
import { CARBON_INTENSITY_GCO2_PER_KWH } from "../core/constants.js";
import { colors } from "../renderer/colors.js";

export function configCommand(action?: string, key?: string, value?: string): void {
  if (action === "show" || !action) {
    const config = loadConfig();
    console.log(colors.bold("\n  co2de Configuration\n"));
    console.log(`  region:         ${config.region} (${CARBON_INTENSITY_GCO2_PER_KWH[config.region] ?? "?"} gCO2/kWh)`);
    console.log(`  daily_budget:   ${config.daily_budget_grams ? config.daily_budget_grams + "g" : "not set"}`);
    console.log(`  compact:        ${config.display.compact}`);
    console.log(`  no_emoji:       ${config.display.no_emoji}`);
    console.log("");
    console.log(colors.dim("  Available regions: " + Object.keys(CARBON_INTENSITY_GCO2_PER_KWH).join(", ")));
    console.log("");
    return;
  }

  if (action === "set" && key && value) {
    if (key === "region") {
      if (!(value in CARBON_INTENSITY_GCO2_PER_KWH)) {
        console.log(colors.red(`  Unknown region: ${value}`));
        console.log(colors.dim("  Available: " + Object.keys(CARBON_INTENSITY_GCO2_PER_KWH).join(", ")));
        return;
      }
      updateConfig({ region: value });
      console.log(`  Region set to ${value} (${CARBON_INTENSITY_GCO2_PER_KWH[value]} gCO2/kWh)`);
    } else if (key === "budget") {
      const grams = parseFloat(value.replace(/g$/i, ""));
      if (isNaN(grams)) {
        console.log(colors.red("  Invalid budget value."));
        return;
      }
      updateConfig({ daily_budget_grams: grams > 0 ? grams : null });
      console.log(grams > 0 ? `  Budget set to ${grams}g` : "  Budget cleared.");
    } else {
      console.log(colors.red(`  Unknown config key: ${key}`));
    }
    return;
  }

  console.log(colors.dim("  Usage: co2de config show | co2de config set <key> <value>"));
}
