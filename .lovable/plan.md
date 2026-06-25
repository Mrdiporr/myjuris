## Goal

Harden `sessions` writes with defense-in-depth: server-side ownership checks, an audit trail, and automated RLS regression tests.

## 1. Server-side ownership validation (defense in depth)

Even though RLS already enforces case ownership (fixed last turn), add a second layer that runs server-side regardless of client code.

- Create `src/lib/sessions.functions.ts` with `createSession` and `updateSession` server functions using `requireSupabaseAuth`.
- Each handler:
  1. Validates input with Zod (`case_id`, fields).
  2. Explicitly queries `cases` with the authenticated `supabase` client to verify `case_id` belongs to `context.userId`. Throws 403 if not.
  3. Performs the insert/update.
- Update `src/routes/_authenticated/cases.$caseId.sessions.$sessionId.tsx` (and any case detail route that creates sessions) to call these server functions instead of writing to `sessions` directly from the browser.
- Add a Postgres `BEFORE INSERT OR UPDATE` trigger on `public.sessions` as a final guard: raises an exception if `NEW.case_id` does not belong to `NEW.user_id`. This protects against any future code path that bypasses the server functions.

## 2. Audit log

New table `public.session_audit_log` recording every create/update.

Columns: `id`, `session_id`, `case_id`, `actor_user_id`, `action` (`'insert' | 'update'`), `changed_fields` (jsonb, names only — no transcript content), `occurred_at`.

- GRANT: `SELECT` to `authenticated` (own rows only), `ALL` to `service_role`. No `INSERT/UPDATE/DELETE` to `authenticated` — only the trigger writes.
- RLS: enabled. Policy: user can SELECT rows where `actor_user_id = auth.uid()` OR they own the underlying case.
- Trigger `AFTER INSERT OR UPDATE ON public.sessions` (SECURITY DEFINER) inserts an audit row with `actor_user_id = auth.uid()`.
- Add a minimal "Activity" section to the session page showing recent audit entries for that session (read via a server function).

## 3. RLS regression tests

Add `src/lib/__tests__/sessions-rls.test.ts` (vitest) that runs against the live Supabase project using the publishable key and two test users.

Test matrix:
- User A creates case Ca. User B creates case Cb.
- User A inserts session with `case_id = Ca` → success.
- User A inserts session with `case_id = Cb` → must fail (RLS).
- User A updates own session to `case_id = Cb` → must fail.
- User B selects User A's sessions → empty.
- Cleanup after each test.

Requires two seeded test users. Plan: read credentials from env vars `TEST_USER_A_EMAIL/PASSWORD` and `TEST_USER_B_EMAIL/PASSWORD`; skip suite when absent so CI without secrets still passes. Document the env vars in a short README note.

Add `bun test` script wiring if not already present.

## Technical details

- Migration order: create audit table + grants + RLS + policies → create trigger functions → create triggers → done.
- Trigger function uses `SET search_path = public` and `SECURITY DEFINER`.
- Server functions live in `src/lib/` (not `src/server/`) per project rules; `*.functions.ts` naming.
- The ownership trigger uses `PERFORM 1 FROM public.cases WHERE id = NEW.case_id AND user_id = NEW.user_id` — raises `insufficient_privilege` if not found.
- No schema change to `sessions` itself.

## Out of scope

- Logging transcript/audio content changes (privacy + size).
- Admin-wide audit dashboard.
- Backfilling audit rows for existing sessions.
