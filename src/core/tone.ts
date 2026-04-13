import type { EmissionLevel } from "./types.js";

interface ToneMessage {
  level: EmissionLevel;
  statusline_icon: string;
  summary: (co2_g: number) => string;
}

export function getEmissionLevel(co2_grams: number): EmissionLevel {
  if (co2_grams < 1) return "low";
  if (co2_grams < 10) return "medium";
  if (co2_grams < 50) return "high";
  return "extreme";
}

export function getToneMessage(co2_grams: number): ToneMessage {
  const level = getEmissionLevel(co2_grams);

  switch (level) {
    case "low":
      return {
        level,
        statusline_icon: "\u{1F4A8}", // 💨
        summary: (g) => `Light session. ${formatCO2(g)} CO2.`,
      };
    case "medium":
      return {
        level,
        statusline_icon: "\u{1F4A8}", // 💨
        summary: (g) => {
          const searches = (g / 0.2).toFixed(0);
          return `That's ${formatCO2(g)} — equivalent to ${searches} Google searches.`;
        },
      };
    case "high":
      return {
        level,
        statusline_icon: "\u{1F4A8}\u{1F4A8}", // 💨💨
        summary: (g) =>
          `Heavy session: ${formatCO2(g)}. Could a smaller model handle next time?`,
      };
    case "extreme":
      return {
        level,
        statusline_icon: "\u{1F3ED}", // 🏭
        summary: (g) => {
          const meters = ((g / 120) * 1000).toFixed(0);
          return `${formatCO2(g)} CO2. Same as driving ${meters} meters.`;
        },
      };
  }
}

export function formatCO2(grams: number): string {
  if (grams < 0.01) return `${(grams * 1000).toFixed(1)}mg`;
  if (grams < 0.1) return `${grams.toFixed(3)}g`;
  if (grams < 10) return `${grams.toFixed(2)}g`;
  if (grams < 100) return `${grams.toFixed(1)}g`;
  return `${grams.toFixed(0)}g`;
}
