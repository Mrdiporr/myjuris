import type { TranscriptSegment } from "@/lib/types";

/** Creates an export-only copy with selected transcript text and speaker labels redacted. */
export function redactTranscriptSnapshot(
  transcript: readonly TranscriptSegment[],
  redactedSegmentIds: ReadonlySet<string>,
  redactedSpeakerLabels: ReadonlySet<string>,
): TranscriptSegment[] {
  return transcript.map((segment) => ({
    ...segment,
    text: redactedSegmentIds.has(segment.id) ? "[REDACTED]" : segment.text,
    speaker: redactedSpeakerLabels.has(segment.speaker) ? "[REDACTED]" : segment.speaker,
  }));
}