import type { CarbonResult } from "../core/types.js";
import { renderSessionBanner } from "./components/session-banner.js";
import { renderCompact } from "./components/compact.js";

/**
 * Detect terminal width.
 */
export function getTerminalWidth(): number {
  return process.stdout.columns ?? 80;
}

/**
 * Detect if terminal supports Unicode.
 */
export function supportsUnicode(): boolean {
  const term = process.env["TERM"] ?? "";
  const lang = process.env["LANG"] ?? "";
  return (
    term.includes("xterm") ||
    term.includes("256color") ||
    lang.includes("UTF-8") ||
    lang.includes("utf-8") ||
    process.platform === "darwin"
  );
}

/**
 * Render session result with appropriate format for terminal.
 */
export function renderSession(result: CarbonResult): string {
  const width = getTerminalWidth();

  if (width < 60) {
    return renderCompact(result);
  }

  return renderSessionBanner(result, width);
}
