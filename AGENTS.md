# Project conventions

- Generate session PDFs client-side in a dedicated, lazily loaded export module with bundled licensed Unicode fonts; this keeps private session content in the browser and avoids server rendering dependencies.
- Route every document export through the shared export job and authenticated export audit so progress, cancellation, retries, and ownership checks remain consistent across formats.
- Case routes render an Outlet for nested session matches and case details only at the case URL; otherwise session controls are hidden behind the parent page.
- Session audio is read through authenticated storage access and sent to transcription providers as uploaded bytes; never issue reusable signed audio URLs, which remain usable after session deletion.