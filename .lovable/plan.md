# Pre-Deployment Readiness — myJuris

Status: core features built, security hardening verified. Below is what remains before flipping to production.

## 1. Functional gaps in committed scope

- **MP3 export**: `src/lib/export.ts` ships WAV/PDF/DOCX only. Either add lamejs-based MP3 encoding in a Web Worker or update the UI/spec to advertise WAV+compressed (Opus/WebM) instead of MP3.
- **Combined ZIP download**: earlier plan promised "audio + transcript together" — confirm the download menu in the session route bundles a single ZIP, or drop the promise.
- **Flags feature finish-line**: verify timestamped flags persist via `updateSession`, render as inline transcript markers, and survive reload from IndexedDB.
- **IndexedDB restore-on-reload**: confirm partial recordings actually rehydrate after a refresh mid-session (chunks + transcript + flags), not just write.
- **Activity timeline polish**: confirm chronological order, actor email lookup decision (kept as UUID per security report), and empty/error states.

## 2. Auth & access

- **Google OAuth provider**: configure in Lovable Cloud auth settings, or remove the Google button from `/auth` to avoid "Unsupported provider" on first click.
- **Email confirmation policy**: decide confirm-on-signup vs. auto-confirm; today's setting drives the first-run UX.
- **Password reset + email change flows**: not yet wired in `src/routes/auth.tsx`.
- **Session timeout / re-auth** for long courtroom recordings (token refresh works, but verify behavior across 2h+ sessions).

## 3. Browser & device compatibility

- **Web Speech API**: Chrome/Edge only. Add a capability check + clear fallback message on Firefox/Safari, or document the supported-browser matrix on the landing page.
- **HTTPS requirement**: already enforced on Lovable domain; document for self-host.
- **Mobile / tablet recording**: spot-check iOS Safari (MediaRecorder support is partial) and Android Chrome.

## 4. Test & CI

- Add the three deferred regression tests from the assurance report:
  1. `diarize.updateTranscript` cross-tenant denial.
  2. `REVOKE EXECUTE` on definer functions.
  3. Tighten "audit cannot be modified" to assert zero rows affected.
- Wire `bun run test` into a CI job with the two test-user secrets so the RLS suite actually runs (today it auto-skips).

## 5. Operational hardening

- **Rate limiting** on `createSession`, `updateSession`, and `diarizeSession` (AssemblyAI cost exposure). Postgres-side counter or edge middleware.
- **Suit-number uniqueness at DB level**: today enforced client-side only. Add a partial unique index `(user_id, lower(suit_number))` so concurrent submits can't collide.
- **Storage lifecycle**: decide retention for audio in the `recordings` bucket; add a cleanup policy or admin UI before storage costs grow.
- **Error reporting**: `src/lib/error-capture.ts` exists — confirm it ships errors somewhere queryable (Sentry/Logflare) or accept console-only.
- **Backups**: confirm Lovable Cloud automated backups cover the project tier, document restore procedure.

## 6. Legal / product surface

- **Privacy policy + Terms** pages (court recordings + third-party diarization disclosure for AssemblyAI).
- **Data Processing notice**: audio leaves the browser → Supabase Storage → AssemblyAI. Must be disclosed to clerks/users.
- **Per-jurisdiction consent banner** before recording starts (some jurisdictions require all-party consent).
- **Export watermarking / chain-of-custody footer** on PDF transcripts for evidentiary use.

## 7. SEO & publish preflight

- Root `__root.tsx` already has title/description/OG/Twitter/og:image — good.
- Add a favicon + apple-touch-icon if not already present in `public/`.
- Add per-route `head()` for `/auth` and `/dashboard` (dashboard already has one; check auth route).
- Run `security--run_security_scan` immediately before publish; fix any new criticals.

## 8. Deployment mechanics

- Confirm `ASSEMBLYAI_API_KEY` is set as a server secret (not just local).
- Verify `wrangler.jsonc` has `nodejs_compat` if any server fn relies on Node built-ins.
- Smoke-test the production build locally: record → stop → diarize → export each format → reload mid-session.
- First publish via `preview_ui--publish`, then connect custom domain if desired.

## Recommended order

1. Decide MP3 vs WAV-only; close (1).
2. Configure Google OAuth or remove the button; close (2).
3. Add suit-number unique index + rate limiting; close (5).
4. Privacy/Terms/consent pages; close (6).
5. CI test job + 3 deferred tests; close (4).
6. Security scan → publish.

Tell me which sections to actually implement and I'll start with the highest-impact ones.
