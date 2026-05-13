export interface TranscriptSegment {
  id: string;
  speaker: string; // e.g. "Speaker 1 (Judge)"
  text: string;
  startMs: number; // offset from session start
  endMs: number;
}

export interface Bookmark {
  id: string;
  label: string;
  timeMs: number;
  createdAt: string;
}

export type CaseStatus = "Active" | "Adjourned" | "Disposed";
