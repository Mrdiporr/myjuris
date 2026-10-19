# Session recording check and PDF redaction review

## User-facing work
- Add a review step before generating a court-ready PDF. Show the current timestamped transcript and speaker labels, with controls to redact individual transcript segments and speaker labels. Replace each selected item with `[REDACTED]` in the PDF.
- Keep review changes limited to that PDF. Do not alter the saved transcript, playback, DOCX/audio exports, bookmarks, or case/session details. Speaker-name redaction applies to speaker labels and the PDF speaker register, not matching words in spoken text or unrelated case/session fields.
- Keep the reviewed snapshot unchanged during generation and retries. Canceling the review closes it without exporting; existing export progress, cancellation, retry, download, and audit behavior remains intact.
- Verify a short live recording on the signed-in session page, then check audio playback and visible timestamped transcription. If the browser has no microphone input, report the limitation without changing app behavior or claiming the live recording succeeded.

## Implementation and verification
- Add PDF-only review state and a copied transcript snapshot; pass a sanitized copy to the PDF export job without persisting redactions.
- Add focused tests for redaction transformation (including preserving IDs/timestamps and source data), selected and unselected speaker labels, and keeping the reviewed data stable for PDF retries. Confirm ordinary DOCX/audio exports are unaffected.
- Run relevant PDF/export tests and confirm the preview build is healthy. Exercise the PDF review flow with redacted and unredacted content where the signed-in session permits.
- For the recording check, use the existing signed-in session, grant microphone permission only to the app, and capture the stopped recording and playback/transcript states if hardware is available.

## Technical details
- The current PDF action enters the shared export job; DOCX/audio use separate inputs. Extend only the PDF path to accept the reviewed snapshot and retain it for retry.
- Redact before PDF generation so removed text is never passed to the PDF renderer. Preserve segment timestamps and IDs; render `[REDACTED]` in place of selected segment text or speaker labels.
- No database schema changes or transcript persistence changes are needed.
