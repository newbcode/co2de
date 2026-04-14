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
        statusline_icon: "CO2",
        summary: (g) => `${formatCO2(g)} CO2 this session.`,
      };
    case "medium":
      return {
        level,
        statusline_icon: "CO2",
        summary: (g) => `${formatCO2(g)} CO2 this session.`,
      };
    case "high":
      return {
        level,
        statusline_icon: "CO2",
        summary: (g) => `${formatCO2(g)} CO2 this session.`,
      };
    case "extreme":
      return {
        level,
        statusline_icon: "CO2",
        summary: (g) => `${formatCO2(g)} CO2 this session.`,
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
