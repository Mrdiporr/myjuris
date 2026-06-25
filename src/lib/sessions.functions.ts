import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCaseOwnership(
  supabase: { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string; user_id: string } | null; error: { message: string } | null }> } } } },
  caseId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("cases")
    .select("id,user_id")
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) {
    throw new Response("Forbidden: case does not belong to current user", { status: 403 });
  }
}

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        caseId: z.string().uuid(),
        title: z.string().trim().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCaseOwnership(supabase as never, data.caseId, userId);

    const { data: row, error } = await supabase
      .from("sessions")
      .insert({ case_id: data.caseId, user_id: userId, title: data.title })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

const SessionUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  caseId: z.string().uuid(),
  patch: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      audio_path: z.string().nullable().optional(),
      audio_mime: z.string().nullable().optional(),
      duration_seconds: z.number().int().nonnegative().optional(),
      transcript: z.array(z.unknown()).optional(),
      bookmarks: z.array(z.unknown()).optional(),
      ended_at: z.string().datetime().nullable().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, "patch must include at least one field"),
});

export const updateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SessionUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCaseOwnership(supabase as never, data.caseId, userId);

    // Reject case_id tampering: client must pass the session's existing case.
    const { data: existing, error: exErr } = await supabase
      .from("sessions")
      .select("id,case_id,user_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing || existing.user_id !== userId) {
      throw new Response("Forbidden", { status: 403 });
    }
    if (existing.case_id !== data.caseId) {
      throw new Response("Forbidden: session does not belong to the provided case", { status: 403 });
    }

    const { error } = await supabase
      .from("sessions")
      .update(data.patch as never)
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listSessionAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("session_audit_log")
      .select("id,action,actor_user_id,changed_fields,occurred_at")
      .eq("session_id", data.sessionId)
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Array<{
      id: string;
      action: "insert" | "update";
      actor_user_id: string | null;
      changed_fields: string[];
      occurred_at: string;
    }> };
  });
