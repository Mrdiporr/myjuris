import { describe, expect, it } from "vitest";
import { applyTextCorrection, reviewEditDiffers } from "@/lib/transcript-corrections";
import { redactTranscriptSnapshot } from "@/lib/transcript-redaction";
import type { TranscriptSegment } from "@/lib/types";

const seg = (over: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  id: "s1",
  speaker: "Speaker 1 (Judge)",
  text: "The court is in session",
  startMs: 0,
  endMs: 1000,
  ...over,
});

describe("applyTextCorrection", () => {
  it("keeps the original wording and records the correction with ids and timestamps intact", () => {
    const next = applyTextCorrection(seg(), "The court is adjourned", "2026-10-25T00:00:00Z");
    expect(next).not.toBeNull();
    expect(next!.id).toBe("s1");
    expect(next!.startMs).toBe(0);
    expect(next!.endMs).toBe(1000);
    expect(next!.originalText).toBe("The court is in session");
    expect(next!.text).toBe("The court is adjourned");
    expect(next!.corrections).toEqual([
      { from: "The court is in session", to: "The court is adjourned", at: "2026-10-25T00:00:00Z" },
    ]);
  });

  it("appends to the edit history and never overwrites the first original", () => {
    const once = applyTextCorrection(seg(), "First fix", "t1")!;
    const twice = applyTextCorrection(once, "Second fix", "t2")!;
    expect(twice.originalText).toBe("The court is in session");
    expect(twice.corrections!.map((c) => c.to)).toEqual(["First fix", "Second fix"]);
    // Source data is not mutated.
    expect(once.text).toBe("First fix");
  });

  it("is a no-op when the text is unchanged", () => {
    expect(applyTextCorrection(seg(), "The court is in session", "t")).toBeNull();
  });

  it("normalizes whitespace and rejects blank text", () => {
    expect(applyTextCorrection(seg(), "  The court is   in session ", "t")).toBeNull();
    expect(applyTextCorrection(seg(), "   ", "t")).toBeNull();
    expect(applyTextCorrection(seg(), "  Corrected  wording ", "t")!.text).toBe("Corrected wording");
  });
});

describe("reviewEditDiffers", () => {
  it("matches the same normalization as applyTextCorrection", () => {
    const s = seg();
    expect(reviewEditDiffers(s, undefined)).toBe(false);
    expect(reviewEditDiffers(s, "The court is in session")).toBe(false);
    expect(reviewEditDiffers(s, "  The court is   in session ")).toBe(false);
    expect(reviewEditDiffers(s, "Actually adjourned")).toBe(true);
  });
});

describe("redaction keeps archive fields on unselected segments", () => {
  it("corrected text and original/history survive on unselected segments; selected text is [REDACTED]", () => {
    const corrected = applyTextCorrection(seg(), "Corrected wording", "t1")!;
    const untouched = seg({ id: "s2", text: "Keep me private" });
    const out = redactTranscriptSnapshot([corrected, untouched], new Set(["s2"]), new Set());
    expect(out[0].text).toBe("Corrected wording");
    expect(out[0].originalText).toBe("The court is in session");
    expect(out[0].corrections).toHaveLength(1);
    expect(out[1].text).toBe("[REDACTED]");
    expect(out[1].originalText).toBeUndefined();
  });
});
