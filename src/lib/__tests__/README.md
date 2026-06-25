# RLS Regression Tests

These tests verify Row-Level Security on the `sessions` table by signing in as
two distinct end users and asserting that cross-tenant writes/reads are denied.

## Required environment variables

```
VITE_SUPABASE_URL=...               # or SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=...   # or SUPABASE_PUBLISHABLE_KEY
TEST_USER_A_EMAIL=usera@example.com
TEST_USER_A_PASSWORD=...
TEST_USER_B_EMAIL=userb@example.com
TEST_USER_B_PASSWORD=...
```

Create the two users once via the normal sign-up flow. The suite auto-skips
when any of the variables above are missing, so CI without these secrets
still passes.

## Run

```
bun run test
```

## What is covered

- A can insert a session into their own case.
- A is denied when inserting a session with `case_id` belonging to B.
- A is denied when spoofing `user_id` to B's id.
- A cannot update a session to reference B's case.
- B cannot read A's sessions.
