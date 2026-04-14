import { describe, it, expect } from "vitest";
import { formatCO2, getEmissionLevel, getToneMessage } from "../../src/core/tone.js";

describe("formatCO2", () => {
  it("formats milligrams", () => {
    expect(formatCO2(0.005)).toBe("5.0mg");
  });

  it("formats small grams with 3 decimals", () => {
    expect(formatCO2(0.045)).toBe("0.045g");
  });

  it("formats medium grams with 2 decimals", () => {
    expect(formatCO2(3.456)).toBe("3.46g");
  });

  it("formats large grams with 1 decimal", () => {
    expect(formatCO2(45.7)).toBe("45.7g");
  });

  it("formats very large grams as integer", () => {
    expect(formatCO2(245.3)).toBe("245g");
  });
});

describe("getEmissionLevel", () => {
  it("returns low for < 1g", () => {
    expect(getEmissionLevel(0.5)).toBe("low");
  });

  it("returns medium for 1-10g", () => {
    expect(getEmissionLevel(5)).toBe("medium");
  });

  it("returns high for 10-50g", () => {
    expect(getEmissionLevel(30)).toBe("high");
  });

  it("returns extreme for > 50g", () => {
    expect(getEmissionLevel(100)).toBe("extreme");
  });
});

describe("getToneMessage", () => {
  it("returns correct level for each emission tier", () => {
    expect(getToneMessage(0.1).level).toBe("low");
    expect(getToneMessage(5).level).toBe("medium");
    expect(getToneMessage(25).level).toBe("high");
    expect(getToneMessage(100).level).toBe("extreme");
  });

  it("summary returns formatted CO2 string", () => {
    const msg = getToneMessage(5.5);
    expect(msg.summary(5.5)).toContain("5.50g");
  });
});
