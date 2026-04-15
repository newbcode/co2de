import type { EmissionLevel } from "./types.js";

export function getEmissionLevel(co2_grams: number): EmissionLevel {
  if (co2_grams < 1) return "low";
  if (co2_grams < 10) return "medium";
  if (co2_grams < 50) return "high";
  return "extreme";
}

export function formatCO2(grams: number): string {
  if (grams < 0.01) return `${(grams * 1000).toFixed(1)}mg`;
  if (grams < 0.1) return `${grams.toFixed(3)}g`;
  if (grams < 10) return `${grams.toFixed(2)}g`;
  if (grams < 100) return `${grams.toFixed(1)}g`;
  return `${grams.toFixed(0)}g`;
}
