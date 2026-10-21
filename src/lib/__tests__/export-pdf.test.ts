import { describe, it, expect } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { exportSessionPdf } from "../export-pdf";
import { redactTranscriptSnapshot } from "../transcript-redaction";
import type { ExportArgs } from "../export";

const fontBytes = {
  regular: new Uint8Array(readFileSync("public/fonts/NotoSans-Regular.ttf")),
  bold: new Uint8Array(readFileSync("public/fonts/NotoSans-Bold.ttf")),
};
mkdirSync("/tmp/pdf-qa", { recursive: true });
const fixture: ExportArgs = {
  caseName: "Adéyẹmí v. Northbridge Holdings", suitNumber: "HC/2026/0142",
  parties: "Dr. Adéyẹmí vs. Northbridge Holdings Ltd.", sessionTitle: "Evidence hearing — Day 2",
  startedAt: "2026-10-14T08:00:00Z", durationSeconds: 5400,
  sessionId: "11111111-1111-4111-8111-111111111111",
  transcript: Array.from({ length: 32 }, (_, i) => ({
    id: `s${i}`, speaker: i % 2 ? "Speaker 2 (Witness — José Martín)" : "Speaker 1 (Judge)",
    startMs: i * 30000, endMs: i * 30000 + 25000,
    text: i === 4 ? "Exhibit-reference-" + "A".repeat(350) : "The witness confirms that the documents were received on the stated date. Counsel requests that the signed agreement be marked as an exhibit for the court record.",
  })).reverse(),
  bookmarks: [
    { id: "b2", label: "Witness identifies the signed agreement.", timeMs: 145000, createdAt: "2026-10-14T08:02:25Z" },
    { id: "b1", label: "Objection overruled — evidence admitted.", timeMs: 45000, createdAt: "2026-10-14T08:00:45Z" },
  ],
};

describe("court-ready PDF export", () => {
  it("creates a multipage PDF with embedded fonts without mutating input", async () => {
    const before = JSON.stringify(fixture);
    const progress: number[] = [];
    const blob = await exportSessionPdf(fixture, { fontBytes, onProgress: value => progress.push(value) });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe("application/pdf");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(3);
    expect(doc.getTitle()).toContain(fixture.suitNumber);
    expect(progress.at(-1)).toBe(90);
    expect(JSON.stringify(fixture)).toBe(before);
    writeFileSync("/tmp/pdf-qa/court-bundle.pdf", bytes);
  });

  it("handles an empty session with explicit empty states", async () => {
    const blob = await exportSessionPdf({ ...fixture, transcript: [], bookmarks: [] }, { fontBytes });
    expect((await PDFDocument.load(await blob.arrayBuffer())).getPageCount()).toBe(3);
    writeFileSync("/tmp/pdf-qa/empty-bundle.pdf", new Uint8Array(await blob.arrayBuffer()));
  });

  it("cancels before generating a file", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(exportSessionPdf(fixture, { fontBytes, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels during document generation", async () => {
    const controller = new AbortController();
    await expect(exportSessionPdf(fixture, {
      fontBytes, signal: controller.signal, onProgress: () => controller.abort(),
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("generates a PDF from a redacted snapshot without including selected transcript content", async () => {
    const source = [
      { id: "private", speaker: "Confidential Witness", text: "SECRET TESTIMONY 74291", startMs: 12500, endMs: 18000 },
      { id: "public", speaker: "Judge", text: "The hearing is adjourned.", startMs: 20000, endMs: 24000 },
    ];
    const reviewedTranscript = redactTranscriptSnapshot(source, new Set(["private"]), new Set(["Confidential Witness"]));
    const blob = await exportSessionPdf({ ...fixture, transcript: reviewedTranscript }, { fontBytes });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(reviewedTranscript).toEqual([
      { id: "private", speaker: "[REDACTED]", text: "[REDACTED]", startMs: 12500, endMs: 18000 },
      { id: "public", speaker: "Judge", text: "The hearing is adjourned.", startMs: 20000, endMs: 24000 },
    ]);
    expect(source[0]).toMatchObject({ speaker: "Confidential Witness", text: "SECRET TESTIMONY 74291" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    writeFileSync("/tmp/pdf-qa/redacted-bundle.pdf", bytes);
  });
});