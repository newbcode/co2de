import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Co2deConfig } from "./types.js";

const CO2DE_DIR = join(homedir(), ".co2de");
const CONFIG_PATH = join(CO2DE_DIR, "config.json");

const DEFAULT_CONFIG: Co2deConfig = {
  region: "global",
  daily_budget_grams: null,
  display: {
    compact: false,
    no_emoji: false,
  },
};

export function getConfigDir(): string {
  return CO2DE_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): Co2deConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Co2deConfig): void {
  if (!existsSync(CO2DE_DIR)) {
    mkdirSync(CO2DE_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function updateConfig(
  updates: Partial<Co2deConfig>,
): Co2deConfig {
  const current = loadConfig();
  const updated = { ...current, ...updates };
  saveConfig(updated);
  return updated;
}
