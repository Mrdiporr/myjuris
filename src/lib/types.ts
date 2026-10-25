export interface TranscriptCorrection {
  from: string;
  to: string;
  at: string; // ISO timestamp of the correction
}

export interface TranscriptSegment {
  id: string;
  speaker: string; // e.g. "Speaker 1 (Judge)"
  text: string;
  startMs: number; // offset from session start
  endMs: number;
  /** Wording before the first correction; captured once and never overwritten. */
  originalText?: string;
  /** Full edit history for the archive; exports use the corrected text only. */
  corrections?: TranscriptCorrection[];
}

export interface Bookmark {
  id: string;
  label: string;
  timeMs: number;
  createdAt: string;
}

export type CaseStatus = "Active" | "Adjourned" | "Disposed";
