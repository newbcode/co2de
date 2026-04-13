import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseSessionFile,
  countLinesWritten,
  encodeProjectPath,
  getSessionSummary,
} from "../../../src/adapters/claude/jsonl-parser.js";

const TEST_DIR = join(tmpdir(), "co2de-test-" + Date.now());

function writeFixture(filename: string, lines: object[]): string {
  const filePath = join(TEST_DIR, filename);
  const content = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  writeFileSync(filePath, content);
  return filePath;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("parseSessionFile", () => {
  it("extracts token usage from assistant messages", () => {
    const filePath = writeFixture("test-session.jsonl", [
      {
        type: "system",
        sessionId: "abc-123",
      },
      {
        type: "user",
        timestamp: "2026-04-13T10:00:00Z",
      },
      {
        type: "assistant",
        sessionId: "abc-123",
        timestamp: "2026-04-13T10:00:05Z",
        message: {
          model: "claude-opus-4-6",
          role: "assistant",
          usage: {
            input_tokens: 5000,
            output_tokens: 1200,
            cache_creation_input_tokens: 3000,
            cache_read_input_tokens: 1500,
          },
        },
      },
      {
        type: "assistant",
        sessionId: "abc-123",
        timestamp: "2026-04-13T10:01:00Z",
        message: {
          model: "claude-opus-4-6",
          role: "assistant",
          usage: {
            input_tokens: 8000,
            output_tokens: 2500,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 6000,
          },
        },
      },
    ]);

    const entries = parseSessionFile(filePath);

    expect(entries).toHaveLength(2);
    expect(entries[0].input_tokens).toBe(5000);
    expect(entries[0].output_tokens).toBe(1200);
    expect(entries[0].cache_write_tokens).toBe(3000);
    expect(entries[0].cache_read_tokens).toBe(1500);
    expect(entries[0].model).toBe("claude-opus-4-6");
    expect(entries[0].provider).toBe("claude");
    expect(entries[0].session_id).toBe("abc-123");

    expect(entries[1].input_tokens).toBe(8000);
    expect(entries[1].cache_read_tokens).toBe(6000);
  });

  it("returns empty array for nonexistent file", () => {
    expect(parseSessionFile("/nonexistent/path.jsonl")).toEqual([]);
  });

  it("skips malformed JSON lines", () => {
    const filePath = join(TEST_DIR, "bad.jsonl");
    writeFileSync(
      filePath,
      '{"type":"assistant","message":{"model":"opus","usage":{"input_tokens":100,"output_tokens":50}}}\nNOT_JSON\n',
    );

    const entries = parseSessionFile(filePath);
    expect(entries).toHaveLength(1);
  });

  it("handles missing usage fields gracefully", () => {
    const filePath = writeFixture("partial.jsonl", [
      {
        type: "assistant",
        timestamp: "2026-04-13T10:00:00Z",
        message: {
          model: "claude-sonnet-4-6",
          usage: {
            input_tokens: 100,
            // output_tokens missing
          },
        },
      },
    ]);

    const entries = parseSessionFile(filePath);
    expect(entries).toHaveLength(1);
    expect(entries[0].output_tokens).toBe(0);
    expect(entries[0].cache_read_tokens).toBe(0);
  });
});

describe("countLinesWritten", () => {
  it("counts lines from Write tool calls", () => {
    const filePath = writeFixture("write-session.jsonl", [
      {
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            {
              type: "tool_use",
              name: "Write",
              input: {
                file_path: "/test/file.ts",
                content: "line1\nline2\nline3\n",
              },
            },
          ],
        },
      },
    ]);

    expect(countLinesWritten(filePath)).toBe(4); // 3 lines + trailing newline
  });

  it("counts net new lines from Edit tool calls", () => {
    const filePath = writeFixture("edit-session.jsonl", [
      {
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            {
              type: "tool_use",
              name: "Edit",
              input: {
                old_string: "old line",
                new_string: "new line 1\nnew line 2\nnew line 3",
              },
            },
          ],
        },
      },
    ]);

    // old: 1 line, new: 3 lines → net +2
    expect(countLinesWritten(filePath)).toBe(2);
  });

  it("returns 0 for file with no tool calls", () => {
    const filePath = writeFixture("no-tools.jsonl", [
      {
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [{ type: "text", text: "Hello" }],
        },
      },
    ]);

    expect(countLinesWritten(filePath)).toBe(0);
  });
});

describe("encodeProjectPath", () => {
  it("replaces slashes with dashes", () => {
    expect(encodeProjectPath("/Users/foo/project")).toBe(
      "-Users-foo-project",
    );
  });
});

describe("getSessionSummary", () => {
  it("returns summary with total tokens and CO2", () => {
    const filePath = writeFixture("summary-test.jsonl", [
      {
        type: "system",
        sessionId: "sum-123",
      },
      {
        type: "assistant",
        sessionId: "sum-123",
        timestamp: "2026-04-13T10:00:00Z",
        message: {
          model: "claude-opus-4-6",
          usage: {
            input_tokens: 5000,
            output_tokens: 1000,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      },
    ]);

    const summary = getSessionSummary(filePath);

    expect(summary).not.toBeNull();
    expect(summary!.id).toBe("sum-123");
    expect(summary!.provider).toBe("claude");
    expect(summary!.model).toBe("claude-opus-4-6");
    expect(summary!.total_tokens).toBe(6000);
    expect(summary!.co2_grams).toBeGreaterThan(0);
  });

  it("returns null for empty file", () => {
    const filePath = writeFixture("empty.jsonl", [
      { type: "system", sessionId: "empty" },
    ]);

    expect(getSessionSummary(filePath)).toBeNull();
  });
});
