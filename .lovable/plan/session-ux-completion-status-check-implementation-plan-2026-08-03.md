# Session UX Completion — Status Check + Implementation Plan

## Status check (what exists today)

| Feature | Status | Evidence |
|---|---|---|
| Editable speaker labels | **Not implemented** | Transcript segments render `seg.speaker` as static text. Timestamps already aligned per segment (`startMs`). |
| Flag button during recording | **Mostly done** | Flag input + button, timestamped bookmarks, right-hand Bookmarks panel, exported to DOCX. Missing: flags are not visible inline in the transcript stream. |
| IndexedDB persistence | **Partial** | Auto-save every 5s of transcript/bookmarks/duration. Audio is only cached *after* stop (during recording the blob is null), so a refresh mid-recording loses all audio. Pending (failed) uploads are not tracked or resumed. |
| Export cancel | **Partial** | Cancel button aborts between stages, but the job then lands in the `error` state ("Cancelled" shown as a failure) and there is no explicit cancelled UI. Retry works but reuses the error path. |

---

## Plan

### 1. Editable speaker labels
- Add inline rename on each transcript segment: click the speaker name to edit (small popover / inline input).
- Two scopes on save: **this segment only** or **rename everywhere** (all segments with the same original label) — the latter is what fixes a diarized "Speaker A" → "Judge" pass in one action.
- Keep `startMs`/`endMs` untouched so timestamps stay aligned to the diarized segment.
- Renames mark the transcript dirty; existing Save/auto-save paths persist them (no schema change — `speaker` is already a field on `TranscriptSegment`).

### 2. Flags visible in the transcript
- Keep the existing Flag button/panel as-is.
- Merge flags into the transcript render as chronologically interleaved marker rows (amber, timestamped, with the note text) so a clerk reading the transcript sees where they flagged.
- Clicking a flag in the right panel scrolls to its position in the transcript.

### 3. Durable IndexedDB persistence
- Stream recorder chunks to IndexedDB as they arrive (timeslice already produces periodic `ondataavailable`), keyed by session id, instead of only caching the final blob.
- On load, if cached chunks exist for the session and no cloud audio is present, offer restore: rebuild the blob, enable playback, and allow upload/diarize of the recovered audio.
- Track upload state (`pending` / `uploaded`) in the cache record; on load, if a blob is `pending`, surface a "Finish upload" action instead of silently dropping it.
- Clear the cache entry only after a confirmed successful upload.

### 4. Clean export cancel
- Add a distinct `cancelled` status to the export job (separate from `error`): neutral icon, "Cancelled" label, progress reset.
- Cancel aborts the current stage, releases the running guard immediately, and leaves a Retry button that starts a fresh job.
- Guard against duplicate exports: a cancelled job cannot resume; Retry always begins from stage 1, and the running-guard prevents two concurrent jobs.
- Ensure any in-flight object URLs / partial blobs are released on cancel.

---

## Technical notes
- Files touched: `src/routes/_authenticated/cases.$caseId.sessions.$sessionId.tsx`, `src/hooks/useExportJob.tsx`, `src/hooks/useRecorder.ts`, `src/lib/idb.ts`, `src/lib/types.ts` (optional flag-marker type).
- No database, RLS, server-function, or auth changes. No new dependencies.
- Order: 4 (self-contained) → 1 → 2 → 3 (largest, touches recorder + cache schema bump to IDB version 2).
