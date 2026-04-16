import { describe, it, expect } from "vitest";
import { svgBadge, paceColor, fmtBadgePace, BADGE_COLORS } from "../../src/badges/svg.js";

describe("svgBadge", () => {
  it("produces a valid SVG root element", () => {
    const out = svgBadge("CO2", "~1.4 t/yr", BADGE_COLORS.orange);
    expect(out).toMatch(/^<svg /);
    expect(out).toContain("xmlns=\"http://www.w3.org/2000/svg\"");
    expect(out).toContain("</svg>");
  });

  it("includes both label and value as visible text", () => {
    const out = svgBadge("lean", "2.1 g/line", BADGE_COLORS.charcoal);
    // Text appears twice (shadow + foreground)
    expect(out.match(/2\.1 g\/line/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out.match(/lean/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("escapes XML-special characters in label/value", () => {
    const out = svgBadge("<a>", "a&b<c>\"'", BADGE_COLORS.charcoal);
    expect(out).not.toContain("<a>");
    expect(out).toContain("&lt;a&gt;");
    expect(out).toContain("&amp;b&lt;c&gt;&quot;&#39;");
  });

  it("uses the provided value color on the right side", () => {
    const out = svgBadge("x", "y", "#ff0000");
    expect(out).toContain("fill=\"#ff0000\"");
  });

  it("includes an aria-label for accessibility", () => {
    const out = svgBadge("CO2", "disclosed", BADGE_COLORS.rust);
    expect(out).toContain("aria-label=\"CO2: disclosed\"");
  });
});

describe("paceColor", () => {
  it("returns lightgrey for very small pace", () => {
    expect(paceColor(10_000)).toBe(BADGE_COLORS.lightgrey);
  });
  it("returns yellow for small pace", () => {
    expect(paceColor(100_000)).toBe(BADGE_COLORS.yellow);
  });
  it("returns orange for medium pace", () => {
    expect(paceColor(500_000)).toBe(BADGE_COLORS.orange);
  });
  it("returns red for heavy pace", () => {
    expect(paceColor(2_000_000)).toBe(BADGE_COLORS.red);
  });
});

describe("fmtBadgePace", () => {
  it("formats grams/yr when below 1 kg", () => {
    expect(fmtBadgePace(500)).toBe("~500 g/yr");
  });
  it("formats kg/yr when below 1 ton", () => {
    expect(fmtBadgePace(45_000)).toBe("~45 kg/yr");
  });
  it("formats t/yr when at or above 1 ton", () => {
    expect(fmtBadgePace(1_400_000)).toBe("~1.4 t/yr");
  });
});
