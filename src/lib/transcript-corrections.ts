import type { TranscriptCorrection, TranscriptSegment } from "@/lib/types";

/**
 * Applies a text correction to a transcript segment and records it in the archive:
 * - `originalText` captures the first-ever wording once and is never overwritten.
 * - Every accepted change appends to `corrections` so reviewers can compare later.
 * - Whitespace is normalized; unchanged or blank text is a no-op (no history churn).
 * Returns the corrected segment, or null when nothing changed.
 */
export function applyTextCorrection(
  segment: TranscriptSegment,
  nextText: string,
  now: string = new Date().toISOString(),
): TranscriptSegment | null {
  const to = nextText.replace(/\s+/g, " ").trim();
  if (!to || to === segment.text) return null;
  const correction: TranscriptCorrection = { from: segment.text, to, at: now };
  return {
    ...segment,
    originalText: segment.originalText ?? segment.text,
    corrections: [...(segment.corrections ?? []), correction],
    text: to,
  };
}

/**
 * True when a reviewed (pre-export) text differs from the segment's current text
 * after the same normalization applyTextCorrection uses.
 */
export function reviewEditDiffers(segment: TranscriptSegment, reviewedText: string | undefined): boolean {
  if (reviewedText == null) return false;
  const to = reviewedText.replace(/\s+/g, " ").trim();
  return !!to && to !== segment.text;
}

/** Apply edits to the exact transcript snapshot shown in pre-export review. */
export function applyReviewedCorrections(
  snapshot: readonly TranscriptSegment[],
  edits: Readonly<Record<string, string>>,
): TranscriptSegment[] {
  return snapshot.map((segment) => {
    const reviewedText = edits[segment.id];
    if (reviewedText === undefined) return { ...segment };
    return applyTextCorrection(segment, reviewedText) ?? { ...segment };
  });
}
