import { loadConfig, updateConfig } from "../core/config.js";
import { CARBON_INTENSITY_GCO2_PER_KWH } from "../core/constants.js";
import { colors } from "../renderer/colors.js";
import { fmtCO2 } from "../renderer/format.js";
import { parseGrams } from "./shared.js";

export function configCommand(action?: string, key?: string, value?: string): void {
  // ── Shortcut: co2de config <region> ──
  if (action && action !== "show" && action !== "set" && action in CARBON_INTENSITY_GCO2_PER_KWH) {
    updateConfig({ region: action });
    console.log(`  Region set to ${action} (${CARBON_INTENSITY_GCO2_PER_KWH[action]} gCO2/kWh)`);
    return;
  }

  // ── Show ──
  if (action === "show" || !action) {
    const config = loadConfig();
    const budgetStr = config.daily_budget_grams
      ? fmtCO2(config.daily_budget_grams)
      : colors.dim("not set");

    console.log(colors.bold("\n  co2de Configuration\n"));
    console.log(`  region:         ${config.region} (${CARBON_INTENSITY_GCO2_PER_KWH[config.region] ?? "?"} gCO2/kWh)`);
    console.log(`  daily_budget:   ${budgetStr}`);
    console.log("");
    console.log(colors.dim("  Available regions: " + Object.keys(CARBON_INTENSITY_GCO2_PER_KWH).join(", ")));
    console.log("");
    console.log(colors.dim("  Shortcuts:"));
    console.log(colors.dim("    co2de config <region>          set region (e.g. co2de config kr)"));
    console.log(colors.dim("    co2de config set budget 50     set daily budget"));
    console.log(colors.dim("    co2de config set budget 0      clear budget"));
    console.log("");
    return;
  }

  // ── Set ──
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
      const grams = parseGrams(value);
      if (grams === null) {
        console.log(colors.red("  Invalid budget value."));
        return;
      }
      updateConfig({ daily_budget_grams: grams > 0 ? grams : null });
      console.log(grams > 0 ? `  Budget set to ${fmtCO2(grams)}` : "  Budget cleared.");
    } else {
      console.log(colors.red(`  Unknown key: ${key}. Available: region, budget`));
    }
    return;
  }

  console.log(colors.dim("  Usage:"));
  console.log(colors.dim("    co2de config               show current settings"));
  console.log(colors.dim("    co2de config <region>       set region (e.g. co2de config kr)"));
  console.log(colors.dim("    co2de config set <key> <v>  set a config value"));
}
