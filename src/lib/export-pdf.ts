import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ExportArgs } from "./export";
import { formatTime } from "./format";

// Print-only document tokens: high-contrast ink on paper.
const ink = rgb(0.09, 0.15, 0.23);
const muted = rgb(0.34, 0.39, 0.45);
const blue = rgb(0.13, 0.32, 0.52);
const rule = rgb(0.81, 0.84, 0.88);
const flagInk = rgb(0.48, 0.29, 0.07);
const flagPaper = rgb(0.98, 0.96, 0.90);
const W = 595.28, H = 841.89, M = 48, BOTTOM = 65;

export interface PdfExportOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  fontBytes?: { regular: Uint8Array; bold: Uint8Array };
}

export async function exportSessionPdf(a: ExportArgs, options: PdfExportOptions = {}): Promise<Blob> {
  const checkpoint = async () => {
    options.signal?.throwIfAborted();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    options.signal?.throwIfAborted();
  };
  await checkpoint();
  const loadFont = async (name: string) => {
    const response = await fetch(`/fonts/NotoSans-${name}.ttf`, { signal: options.signal });
    if (!response.ok) throw new Error("PDF font could not load. Please retry when connected.");
    return new Uint8Array(await response.arrayBuffer());
  };
  const bytes = options.fontBytes ?? { regular: await loadFont("Regular"), bold: await loadFont("Bold") };
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(bytes.regular, { subset: true });
  const bold = await doc.embedFont(bytes.bold, { subset: true });
  const generatedAt = new Date();
  doc.setTitle(`${a.suitNumber} — ${a.sessionTitle}`);
  doc.setAuthor("myJuris");
  doc.setSubject("Session details, timestamped transcript and bookmarked moments");
  doc.setCreator("myJuris Court-ready exports");
  doc.setCreationDate(generatedAt);

  const clean = (text: string) => text.normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const supported = new Set(regular.getCharacterSet());
  for (const text of [a.caseName, a.suitNumber, a.parties, a.sessionTitle, ...a.transcript.flatMap(s => [s.speaker, s.text]), ...a.bookmarks.map(b => b.label)]) {
    if (Array.from(clean(text)).some(c => !/\s/.test(c) && !supported.has(c.codePointAt(0) ?? 0))) {
      throw new Error("This session contains characters not supported by the PDF font. Export DOCX to preserve the original text.");
    }
  }
  const lines = (text: string, font: PDFFont, size: number, width: number) => {
    const result: string[] = [];
    for (const paragraph of clean(text).replace(/\t/g, "    ").split(/\r?\n/)) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
        if (current) result.push(current);
        current = "";
        for (const char of word) {
          if (current && font.widthOfTextAtSize(current + char, size) > width) { result.push(current); current = ""; }
          current += char;
        }
      }
      result.push(current);
    }
    return result;
  };
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  let section = "SESSION OVERVIEW";
  const text = (value: string, x: number, yy: number, size = 10, font = regular, color = ink) => {
    page.drawText(value, { x, y: yy, size, font, color });
  };
  const newPage = () => {
    page = doc.addPage([W, H]);
    text("myJuris", M, H - 39, 15, bold, blue);
    text(section, W - M - bold.widthOfTextAtSize(section, 8), H - 36, 8, bold, muted);
    page.drawLine({ start: { x: M, y: H - 52 }, end: { x: W - M, y: H - 52 }, color: rule, thickness: 0.7 });
    y = H - 83;
  };
  const ensure = (height: number) => { if (y - height < BOTTOM) newPage(); };
  const paragraph = (value: string, size = 10, font = regular, color = ink, x = M, width = W - M * 2) => {
    for (const line of lines(value, font, size, width)) { ensure(size * 1.5); text(line, x, y, size, font, color); y -= size * 1.5; }
  };
  const heading = (value: string) => { ensure(60); y -= 12; paragraph(value, 16, bold); y -= 9; };
  const timestamp = (ms: number) => formatTime(ms / 1000);
  const date = (value: string | Date) => new Date(value).toLocaleString("en-GB", { timeZone: "UTC", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " UTC";
  const bookmarks = [...a.bookmarks].sort((l, r) => l.timeMs - r.timeMs);
  const transcript = [...a.transcript].sort((l, r) => l.startMs - r.startMs);
  const speakers = [...new Set(transcript.map(s => s.speaker))];
  doc.removePage(0);
  newPage();
  paragraph("COURT SESSION RECORD", 9, bold, blue);
  y -= 14;
  paragraph(a.caseName, 24, bold);
  y -= 8;
  paragraph(a.suitNumber, 13, bold, blue);
  heading("Case & session details");
  for (const [label, value] of [
    ["PARTIES", a.parties], ["SESSION", a.sessionTitle], ["RECORDED", date(a.startedAt)],
    ["DURATION", formatTime(a.durationSeconds)], ["SESSION ID", a.sessionId ?? "Not provided"],
    ["GENERATED", date(generatedAt)],
  ]) {
    const valueLines = lines(value, regular, 10, W - M * 2);
    ensure(23 + valueLines.length * 15);
    paragraph(label, 8, bold, muted); y -= 2;
    paragraph(value); y -= 9;
  }
  heading("Record summary");
  paragraph(`${transcript.length} transcript segments  /  ${speakers.length} speaker labels  /  ${bookmarks.length} bookmarked moments`, 10, bold);
  y -= 12;
  paragraph("Prepared from the current session snapshot. Timestamps are elapsed from the start of the recording; dates are shown in UTC. Speaker labels are reproduced as entered, not identity-verified.", 9, regular, muted);
  y -= 8;
  paragraph("Review against the original audio before filing. This is not a certified transcript or a guarantee of court admissibility. The PDF does not contain the audio recording.", 9, regular, muted);
  heading("Speaker register");
  if (!speakers.length) paragraph("No speaker labels available.", 10, regular, muted);
  for (const speaker of speakers) paragraph(speaker, 10);

  section = "TIMESTAMPED TRANSCRIPT";
  newPage(); heading("Transcript & flagged moments");
  paragraph("Elapsed time  ·  Speaker labels  ·  Numbered transcript lines", 9, regular, muted); y -= 16;
  const timeline = [
    ...transcript.map(s => ({ time: s.startMs, segment: s, flag: null })),
    ...bookmarks.map(b => ({ time: b.timeMs, segment: null, flag: b })),
  ].sort((l, r) => l.time - r.time);
  const flagPages = new Map<string, number>();
  let lineNumber = 0;
  if (!transcript.length) { paragraph("No transcript available for this session.", 10, regular, muted); y -= 16; }
  for (const [index, entry] of timeline.entries()) {
    await checkpoint();
    options.onProgress?.(20 + 65 * (index + 1) / Math.max(1, timeline.length));
    if (entry.flag) {
      ensure(60);
      flagPages.set(entry.flag.id, doc.getPageCount());
      for (const line of lines(`FLAG  ${timestamp(entry.time)}  |  ${entry.flag.label}`, bold, 9, W - M * 2 - 24)) {
        ensure(20);
        page.drawRectangle({ x: M, y: y - 6, width: W - M * 2, height: 20, color: flagPaper });
        text(line, M + 12, y, 9, bold, flagInk); y -= 20;
      }
      y -= 13;
    } else if (entry.segment) {
      const s = entry.segment;
      const header = `${timestamp(s.startMs)} – ${timestamp(s.endMs)}   |   ${s.speaker}`;
      ensure(54); paragraph(header, 9, bold, blue); y -= 2;
      for (const line of lines(s.text, regular, 10, W - M * 2 - 34)) {
        if (y - 16 < BOTTOM) { newPage(); paragraph(`${header} (continued)`, 9, bold, blue); y -= 2; }
        lineNumber++;
        text(String(lineNumber).padStart(3, "0"), M, y, 7, regular, muted);
        text(line, M + 34, y); y -= 16;
      }
      y -= 16;
    }
  }

  section = "BOOKMARK INDEX";
  newPage(); heading("Bookmarked moments");
  paragraph(`${bookmarks.length} flagged moment${bookmarks.length === 1 ? "" : "s"}`, 10, regular, muted); y -= 18;
  if (!bookmarks.length) paragraph("No bookmarked moments were recorded.", 10, regular, muted);
  for (const b of bookmarks) {
    await checkpoint(); ensure(60);
    paragraph(`${timestamp(b.timeMs)}  /  Transcript page ${flagPages.get(b.id) ?? "—"}`, 9, bold, blue);
    paragraph(b.label); y -= 18;
  }
  const pages = doc.getPages();
  const footerCase = lines(a.suitNumber, regular, 8, 270)[0] ?? "";
  for (const [i, p] of pages.entries()) {
    page = p;
    page.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, color: rule, thickness: 0.7 });
    text(footerCase, M, 31, 8, regular, muted);
    const label = `${i + 1} / ${pages.length}`;
    text(label, W - M - regular.widthOfTextAtSize(label, 8), 31, 8, regular, muted);
  }
  options.onProgress?.(90);
  await checkpoint();
  const output = await doc.save();
  await checkpoint();
  return new Blob([Uint8Array.from(output).buffer], { type: "application/pdf" });
}