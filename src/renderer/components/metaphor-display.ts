import type { MetaphorSet } from "../../core/types.js";
import { colors } from "../colors.js";

/**
 * Render metaphor comparisons as human-readable lines.
 */
export function renderMetaphors(m: MetaphorSet): string {
  const lines: string[] = [];

  if (m.tree_absorption_seconds > 0) {
    const treeTime = formatDuration(m.tree_absorption_seconds);
    lines.push(`  \u{1F333} A tree absorbs this in ${treeTime}`);
  }

  if (m.car_drive_meters > 0) {
    const distance = formatDistance(m.car_drive_meters);
    lines.push(`  \u{1F697} Same as driving a car ${distance}`);
  }

  if (m.google_searches > 0) {
    const searches = m.google_searches.toFixed(1);
    lines.push(`  \u{1F50D} Equivalent to ${searches} Google searches`);
  }

  if (m.phone_charges > 0) {
    const charges = m.phone_charges.toFixed(2);
    lines.push(`  \u{1F4F1} ${charges} smartphone charges`);
  }

  if (m.netflix_streaming_seconds > 60) {
    const time = formatDuration(m.netflix_streaming_seconds);
    lines.push(`  \u{1F4FA} ${time} of Netflix streaming`);
  }

  if (m.led_bulb_hours > 0) {
    const hours = m.led_bulb_hours.toFixed(2);
    lines.push(`  \u{1F4A1} ${hours} hours of an LED bulb`);
  }

  return lines.join("\n");
}

/**
 * Render metaphors in compact single-line format.
 */
export function renderMetaphorsCompact(m: MetaphorSet): string {
  const parts: string[] = [];

  if (m.google_searches >= 1) {
    parts.push(`${m.google_searches.toFixed(0)} searches`);
  }
  if (m.phone_charges >= 0.01) {
    parts.push(`${m.phone_charges.toFixed(2)} charges`);
  }
  if (m.car_drive_meters >= 1) {
    parts.push(`${formatDistance(m.car_drive_meters)} driven`);
  }

  return parts.length > 0
    ? colors.dim(parts.join(" | "))
    : "";
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

function formatDistance(meters: number): string {
  if (meters < 1) return `${(meters * 100).toFixed(1)}cm`;
  if (meters < 1000) return `${meters.toFixed(0)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
