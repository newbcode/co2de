import { describe, it, expect } from "vitest";
import { computePractice, THRESHOLDS } from "../../src/badges/practice.js";
import { createMockEntry } from "../helpers/mock-adapter.js";

describe("computePractice", () => {
  it("always qualifies the disclosed badge", () => {
    const result = computePractice({ sessions: [], entries: [], linesWritten: 0 });
    const disclosed = result.find((b) => b.key === "disclosed");
    expect(disclosed?.qualifies).toBe(true);
  });

  it("qualifies lean when g/line under threshold", () => {
    const sessions = [{ co2_grams: 500 }];                      // 0.5 kg total
    const linesWritten = 1000;                                   // 0.5 g/line
    const result = computePractice({ sessions, entries: [], linesWritten });
    const lean = result.find((b) => b.key === "lean")!;
    expect(lean.qualifies).toBe(true);
    expect(lean.value).toMatch(/g\/line/);
  });

  it("does not qualify lean when g/line exceeds threshold", () => {
    const sessions = [{ co2_grams: 50_000 }];                   // 50 kg
    const linesWritten = 100;                                    // 500 g/line
    const result = computePractice({ sessions, entries: [], linesWritten });
    const lean = result.find((b) => b.key === "lean")!;
    expect(lean.qualifies).toBe(false);
  });

  it("does not qualify lean when no lines written", () => {
    const result = computePractice({
      sessions: [{ co2_grams: 100 }],
      entries: [],
      linesWritten: 0,
    });
    const lean = result.find((b) => b.key === "lean")!;
    expect(lean.qualifies).toBe(false);
  });

  it("qualifies stable when cache_read dominates", () => {
    const entries = [
      createMockEntry({ cache_read_tokens: 950, input_tokens: 50, cache_write_tokens: 0 }),
    ];
    const result = computePractice({ sessions: [], entries, linesWritten: 0 });
    const stable = result.find((b) => b.key === "stable")!;
    expect(stable.qualifies).toBe(true);
  });

  it("does not qualify stable when cache_read is small", () => {
    const entries = [
      createMockEntry({ cache_read_tokens: 100, input_tokens: 900, cache_write_tokens: 0 }),
    ];
    const result = computePractice({ sessions: [], entries, linesWritten: 0 });
    const stable = result.find((b) => b.key === "stable")!;
    expect(stable.qualifies).toBe(false);
  });

  it("qualifies concise when avg input/turn is under threshold", () => {
    const entries = [
      createMockEntry({ input_tokens: 500 }),
      createMockEntry({ input_tokens: 1000 }),
    ];
    const result = computePractice({ sessions: [], entries, linesWritten: 0 });
    const concise = result.find((b) => b.key === "concise")!;
    expect(concise.qualifies).toBe(true);
    expect(concise.value).toBe("750 tok/turn");
  });

  it("does not qualify concise when input/turn exceeds threshold", () => {
    const entries = [createMockEntry({ input_tokens: THRESHOLDS.conciseInputTok + 1000 })];
    const result = computePractice({ sessions: [], entries, linesWritten: 0 });
    const concise = result.find((b) => b.key === "concise")!;
    expect(concise.qualifies).toBe(false);
  });
});
