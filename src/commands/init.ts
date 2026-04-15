import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { colors } from "../renderer/colors.js";
import { getConfigDir, saveConfig, loadConfig } from "../core/config.js";

const STATUSLINE_PATH = join(homedir(), ".claude", "statusline-command.sh");

const CO2_BLOCK = `
# --- CO2 emission estimate (added by co2de) ---
co2_result=$(awk -v ti="$total_in" -v to="$total_out" -v model="$model_id" \\
  'BEGIN {
    wh = 0.0030
    if (model ~ /opus/)   wh = 0.0050
    if (model ~ /sonnet/) wh = 0.0025
    if (model ~ /haiku/)  wh = 0.0010
    pue = 1.2; ci = 475
    energy_wh = (ti + to) * wh * pue
    co2_g = (energy_wh / 1000) * ci
    if (co2_g < 0.1) printf "%.2fg", co2_g
    else if (co2_g < 10) printf "%.1fg", co2_g
    else printf "%.0fg", co2_g
  }')

co2_num=$(echo "$co2_result" | tr -d 'g')

co2_gauge=$(awk -v g="$co2_num" 'BEGIN {
  if (g <= 0)      printf "%s", "    "
  else if (g < 1)  printf "%s", "\\xe2\\x96\\x8f   "
  else if (g < 5)  printf "%s", "\\xe2\\x96\\x8e   "
  else if (g < 10) printf "%s", "\\xe2\\x96\\x8d\\xe2\\x96\\x91  "
  else if (g < 20) printf "%s", "\\xe2\\x96\\x8c\\xe2\\x96\\x91  "
  else if (g < 50) printf "%s", "\\xe2\\x96\\x88\\xe2\\x96\\x91\\xe2\\x96\\x91 "
  else if (g < 100)printf "%s", "\\xe2\\x96\\x88\\xe2\\x96\\x88\\xe2\\x96\\x91 "
  else if (g < 500)printf "%s", "\\xe2\\x96\\x88\\xe2\\x96\\x88\\xe2\\x96\\x88\\xe2\\x96\\x91"
  else              printf "%s", "\\xe2\\x96\\x88\\xe2\\x96\\x88\\xe2\\x96\\x88\\xe2\\x96\\x88"
}')

RED_BG='\\033[41;97;1m'
MAGENTA_BOLD='\\033[1;35m'
if [ "$(echo "$co2_num >= 50" | bc -l 2>/dev/null || echo 0)" -eq 1 ]; then
  co2_part="\${RED_BG:-\\$RED_BG} CO\u2082 \${co2_gauge}\${co2_result} \${RESET}"
elif [ "$(echo "$co2_num >= 10" | bc -l 2>/dev/null || echo 0)" -eq 1 ]; then
  co2_part="\${MAGENTA_BOLD:-\\$MAGENTA_BOLD}CO\u2082 \${co2_gauge}\${co2_result}\${RESET}"
elif [ "$(echo "$co2_num >= 1" | bc -l 2>/dev/null || echo 0)" -eq 1 ]; then
  co2_part="\${YELLOW}CO\u2082 \${co2_gauge}\${co2_result}\${RESET}"
else
  co2_part="\${DIM}\${GREEN}CO\u2082 \${co2_gauge}\${co2_result}\${RESET}"
fi
# --- end co2de ---`;

export function initCommand(): void {
  console.log(colors.bold("\n\u{1F4A8} co2de init\n"));

  // 1. Ensure config directory
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
    console.log(`  Created ${configDir}`);
  }

  // 2. Save default config
  const config = loadConfig();
  saveConfig(config);
  console.log(`  Config initialized at ${configDir}/config.json`);

  // 3. Patch statusline
  if (!existsSync(STATUSLINE_PATH)) {
    console.log(colors.yellow("  Statusline script not found at " + STATUSLINE_PATH));
    console.log(colors.dim("  Skipping statusline patch."));
    return;
  }

  const content = readFileSync(STATUSLINE_PATH, "utf-8");

  if (content.includes("co2de")) {
    console.log(colors.dim("  Statusline already patched."));
    return;
  }

  // Backup
  const backupPath = STATUSLINE_PATH + ".co2de-backup";
  copyFileSync(STATUSLINE_PATH, backupPath);
  console.log(`  Backed up statusline to ${backupPath}`);

  // Insert CO2 block before the final printf
  const printfIndex = content.lastIndexOf("printf");
  if (printfIndex === -1) {
    console.log(colors.red("  Could not find printf in statusline script."));
    return;
  }

  // Replace the final printf to include co2_part
  const beforePrintf = content.slice(0, printfIndex);
  const printfLine = content.slice(printfIndex);

  // Add co2_part to the printf output
  const patchedPrintf = printfLine.replace(
    /\$\{cost\}"/,
    '${cost}  |  ${co2_part}"',
  );

  const patched = beforePrintf + CO2_BLOCK + "\n\n" + patchedPrintf;
  writeFileSync(STATUSLINE_PATH, patched);

  console.log(colors.green("  Statusline patched! CO2 will show in your Claude CLI."));
  console.log(colors.dim("  Restore with: cp " + backupPath + " " + STATUSLINE_PATH));
  console.log("");
}
