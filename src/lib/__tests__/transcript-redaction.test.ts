import { describe, expect, it } from "vitest";
import { redactTranscriptSnapshot } from "../transcript-redaction";
import type { TranscriptSegment } from "@/lib/types";

describe("PDF transcript redaction snapshots", () => {
  const transcript: readonly TranscriptSegment[] = Object.freeze([
    Object.freeze({ id: "one", speaker: "Judge", text: "Private passage", startMs: 1200, endMs: 2400 }),
    Object.freeze({ id: "two", speaker: "Judge", text: "Public passage", startMs: 3000, endMs: 4200 }),
    Object.freeze({ id: "three", speaker: "Witness", text: "Another statement", startMs: 5000, endMs: 6500 }),
  ]);

  it("redacts selected passages and labels without changing source text, IDs, or timestamps", () => {
    const before = JSON.stringify(transcript);
    const result = redactTranscriptSnapshot(transcript, new Set(["one"]), new Set(["Judge"]));

    expect(result).toEqual([
      { id: "one", speaker: "[REDACTED]", text: "[REDACTED]", startMs: 1200, endMs: 2400 },
      { id: "two", speaker: "[REDACTED]", text: "Public passage", startMs: 3000, endMs: 4200 },
      { id: "three", speaker: "Witness", text: "Another statement", startMs: 5000, endMs: 6500 },
    ]);
    expect(JSON.stringify(transcript)).toBe(before);
    expect(result).not.toBe(transcript);
  });

  it("keeps the reviewed copy stable if the original transcript later changes", () => {
    const reviewed = redactTranscriptSnapshot(transcript, new Set(["one"]), new Set(["Witness"]));
    const retrySnapshot = reviewed.map((segment) => ({ ...segment }));

    expect(retrySnapshot).toEqual(reviewed);
    expect(retrySnapshot[0]).toMatchObject({ id: "one", text: "[REDACTED]", startMs: 1200, endMs: 2400 });
    expect(retrySnapshot[2]).toMatchObject({ speaker: "[REDACTED]", text: "Another statement" });
  });
});