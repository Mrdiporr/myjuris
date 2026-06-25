import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const A_EMAIL = process.env.TEST_USER_A_EMAIL;
const A_PASS = process.env.TEST_USER_A_PASSWORD;
const B_EMAIL = process.env.TEST_USER_B_EMAIL;
const B_PASS = process.env.TEST_USER_B_PASSWORD;

const haveCreds = !!(URL && KEY && A_EMAIL && A_PASS && B_EMAIL && B_PASS);

// Suite is skipped automatically when test users aren't configured.
const d = haveCreds ? describe : describe.skip;

function makeClient() {
  return createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string, password: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`sign in failed for ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}

d("sessions RLS regression", () => {
  let A: { client: SupabaseClient; userId: string };
  let B: { client: SupabaseClient; userId: string };
  let caseA: string;
  let caseB: string;
  const cleanup: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    A = await signIn(A_EMAIL!, A_PASS!);
    B = await signIn(B_EMAIL!, B_PASS!);

    const suffix = Date.now();
    const a = await A.client.from("cases").insert({
      user_id: A.userId,
      case_name: `RLS A ${suffix}`,
      suit_number: `RLS-A-${suffix}`,
      plaintiff: "P", defendant: "D",
    }).select("id").single();
    if (a.error) throw new Error(a.error.message);
    caseA = a.data.id;

    const b = await B.client.from("cases").insert({
      user_id: B.userId,
      case_name: `RLS B ${suffix}`,
      suit_number: `RLS-B-${suffix}`,
      plaintiff: "P", defendant: "D",
    }).select("id").single();
    if (b.error) throw new Error(b.error.message);
    caseB = b.data.id;

    cleanup.push(() => A.client.from("cases").delete().eq("id", caseA));
    cleanup.push(() => B.client.from("cases").delete().eq("id", caseB));
  });

  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("A can insert a session into their own case", async () => {
    const { data, error } = await A.client.from("sessions").insert({
      case_id: caseA, user_id: A.userId, title: "ok",
    }).select("id").single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) await A.client.from("sessions").delete().eq("id", data.id);
  });

  it("A is denied when inserting a session for B's case", async () => {
    const { data, error } = await A.client.from("sessions").insert({
      case_id: caseB, user_id: A.userId, title: "nope",
    }).select("id").single();
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("A is denied when spoofing user_id to B's id", async () => {
    const { data, error } = await A.client.from("sessions").insert({
      case_id: caseB, user_id: B.userId, title: "spoof",
    }).select("id").single();
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("A cannot update an existing session to reference B's case", async () => {
    const ins = await A.client.from("sessions").insert({
      case_id: caseA, user_id: A.userId, title: "to update",
    }).select("id").single();
    expect(ins.error).toBeNull();
    const id = ins.data!.id;

    const upd = await A.client.from("sessions").update({ case_id: caseB }).eq("id", id);
    expect(upd.error).not.toBeNull();

    await A.client.from("sessions").delete().eq("id", id);
  });

  it("B cannot read A's sessions", async () => {
    const ins = await A.client.from("sessions").insert({
      case_id: caseA, user_id: A.userId, title: "private",
    }).select("id").single();
    const id = ins.data!.id;

    const { data } = await B.client.from("sessions").select("id").eq("id", id);
    expect(data ?? []).toEqual([]);

    await A.client.from("sessions").delete().eq("id", id);
  });
});

if (!haveCreds) {
  describe("sessions RLS regression", () => {
    it.skip("set TEST_USER_A_EMAIL/PASSWORD and TEST_USER_B_EMAIL/PASSWORD plus VITE_SUPABASE_URL/PUBLISHABLE_KEY to run", () => {});
  });
}
