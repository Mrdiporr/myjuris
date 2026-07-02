# Pre-Deployment Priorities — Recommended Order

Ranked by risk-to-launch. Each item has: **why it matters**, **alternative (cheaper path)**, **advice**.

---

## Tier 1 — Must fix before publish (blockers)

### 1. Google OAuth button on `/auth` will error on click
- **Why**: The button is rendered but no provider is configured. First-time users clicking it get "Unsupported provider" — worst possible first impression for a legal product.
- **Alternative**: Remove the Google button entirely and ship email/password only. Zero config, zero risk.
- **Advice**: If courts/clerks use Google Workspace, enable it (managed by Lovable Cloud, no keys needed). Otherwise remove — you can add later without migration.

### 2. Consent banner + Data Processing disclosure
- **Why**: Recording proceedings without disclosing that audio is uploaded to Supabase Storage and shipped to **AssemblyAI** (a US third party) is a legal exposure in most jurisdictions. Many require all-party consent.
- **Alternative**: A one-time modal on first recording ("This session will be recorded and processed by a third-party transcription service. Continue?") is 80% of the value of a full policy.
- **Advice**: Non-negotiable for a courtroom product. Ship even a minimal version before launch; a proper Privacy Policy + Terms page can follow.

### 3. Suit-number uniqueness at DB level
- **Why**: Today it's client-checked only. Two tabs / two clerks can create duplicate suit numbers → case-file confusion in a legal context is a data-integrity bug, not a UX bug.
- **Alternative**: None worth taking — this is a one-line migration: partial unique index `(user_id, lower(suit_number))`.
- **Advice**: Cheapest high-value item on the list. Do it.

### 4. Browser capability check for Web Speech API
- **Why**: Web Speech API is Chrome/Edge only. A Firefox/Safari user hits "Record" and gets silence with no explanation — looks like the app is broken.
- **Alternative**: A capability check on the record button ("Live transcription requires Chrome or Edge. Recording will still work; transcript will be generated after upload via diarization.") — no code path changes, just messaging.
- **Advice**: Diarization already provides a transcript post-hoc, so the fallback is real, not just a warning. Ship the message.

---

## Tier 2 — Strongly recommended (quality-of-launch)

### 5. Password reset flow
- **Why**: Users **will** forget passwords. Without a `/reset-password` route they're locked out permanently.
- **Alternative**: None. Cloud auth ships the email; you just need the reset page.
- **Advice**: ~30 min of work. Do it.

### 6. Rate limit `diarizeSession`
- **Why**: AssemblyAI is paid per minute. A compromised account or a script kiddie can burn your budget in an hour.
- **Alternative**: Since the backend has no standard rate-limit primitive, the pragmatic MVP is a Postgres counter (calls-per-user-per-day) checked inside `diarizeSession`. Not perfect, but bounds worst-case spend.
- **Advice**: At minimum add a hard daily cap per user. Full rate limiting can wait.

### 7. Publish preflight — favicon + security scan
- **Why**: Missing favicon = unprofessional. A fresh security scan catches anything the last hardening pass missed.
- **Alternative**: None. Both are ~5 min.
- **Advice**: Run the scan **last**, immediately before publish.

---

## Tier 3 — Post-launch is fine

- **MP3 export** — WAV works for evidentiary use (lossless is arguably better for courts). Advertise WAV; add MP3 later only if users ask.
- **Combined ZIP download** — nice-to-have; individual downloads already work.
- **CI test job** — the RLS tests already exist; wiring them into CI is good hygiene but doesn't block launch.
- **Deferred regression tests** (3 items) — coverage improvement, not a gap.
- **Storage lifecycle policy** — irrelevant until you have volume.
- **Session timeout for 2h+ recordings** — verify empirically once real users hit it.
- **PDF watermarking / chain-of-custody footer** — needed for formal evidentiary use; not for beta.
- **Activity timeline polish, IndexedDB restore verification, Flags finish-line** — QA passes, not new features. Roll into a single "smoke test everything on prod build" session (item #7 already implies this).

---

## Recommended execution order

1. Google OAuth decision (configure or remove) — 10 min
2. Suit-number DB unique index — 10 min
3. Capability check message on record button — 20 min
4. Password reset route — 30 min
5. Consent modal on first recording — 45 min
6. Daily cap on `diarizeSession` — 30 min
7. Favicon + security scan + publish — 15 min

**Total: ~2.5 hours to a defensible launch.**

Everything in Tier 3 can ship as v1.1.

---

Tell me which tiers/items to execute (e.g. "do all of Tier 1", "Tier 1 + items 5 and 6", "everything except MP3") and I'll switch to build mode and implement in that order.
