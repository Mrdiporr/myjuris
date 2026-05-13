import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import type { Bookmark, TranscriptSegment } from "./types";
import { formatTime } from "./format";

interface ExportArgs {
  caseName: string;
  suitNumber: string;
  parties: string;
  sessionTitle: string;
  startedAt: string;
  durationSeconds: number;
  transcript: TranscriptSegment[];
  bookmarks: Bookmark[];
}

export async function exportTranscriptDocx(a: ExportArgs): Promise<Blob> {
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "COURT SESSION TRANSCRIPT", bold: true })] }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({ children: [new TextRun({ text: "Case: ", bold: true }), new TextRun(a.caseName)] }),
          new Paragraph({ children: [new TextRun({ text: "Suit No.: ", bold: true }), new TextRun(a.suitNumber)] }),
          new Paragraph({ children: [new TextRun({ text: "Parties: ", bold: true }), new TextRun(a.parties)] }),
          new Paragraph({ children: [new TextRun({ text: "Session: ", bold: true }), new TextRun(a.sessionTitle)] }),
          new Paragraph({ children: [new TextRun({ text: "Recorded: ", bold: true }), new TextRun(new Date(a.startedAt).toLocaleString())] }),
          new Paragraph({ children: [new TextRun({ text: "Duration: ", bold: true }), new TextRun(formatTime(a.durationSeconds))] }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Transcript", bold: true })] }),
          ...(a.transcript.length === 0
            ? [new Paragraph({ children: [new TextRun({ text: "(no transcript available)", italics: true })] })]
            : a.transcript.map((s) =>
                new Paragraph({
                  spacing: { after: 120 },
                  children: [
                    new TextRun({ text: `[${formatTime(s.startMs / 1000)}] `, bold: true, color: "1F4E79" }),
                    new TextRun({ text: `${s.speaker}: `, bold: true }),
                    new TextRun(s.text),
                  ],
                }),
              )),
          ...(a.bookmarks.length > 0
            ? [
                new Paragraph({ children: [new TextRun("")] }),
                new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Bookmarks / Flags", bold: true })] }),
                ...a.bookmarks.map((b) =>
                  new Paragraph({
                    children: [
                      new TextRun({ text: `[${formatTime(b.timeMs / 1000)}] `, bold: true, color: "B45309" }),
                      new TextRun(b.label),
                    ],
                  }),
                ),
              ]
            : []),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
