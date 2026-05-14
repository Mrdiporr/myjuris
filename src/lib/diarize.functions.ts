import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface AAUtterance {
  speaker: string;
  text: string;
  start: number; // ms
  end: number; // ms
}

interface AATranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  utterances?: AAUtterance[] | null;
  text?: string | null;
}

const AA = "https://api.assemblyai.com/v2";

async function aaFetch(path: string, init: RequestInit, key: string) {
  const r = await fetch(`${AA}${path}`, {
    ...init,
    headers: {
      authorization: key,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`AssemblyAI ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.json();
}

export const diarizeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "ASSEMBLYAI_API_KEY is not configured." };
    }

    const { supabase, userId } = context;

    // Load session row (RLS scoped to user).
    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("id,user_id,audio_path")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sErr) return { ok: false as const, error: sErr.message };
    if (!session?.audio_path) {
      return { ok: false as const, error: "No audio uploaded for this session yet." };
    }
    if (session.user_id !== userId) {
      return { ok: false as const, error: "Forbidden" };
    }

    // Signed URL for AssemblyAI to fetch the audio directly.
    const { data: signed, error: signErr } = await supabase.storage
      .from("session-audio")
      .createSignedUrl(session.audio_path, 60 * 60);
    if (signErr || !signed?.signedUrl) {
      return { ok: false as const, error: signErr?.message ?? "Could not sign audio URL" };
    }

    try {
      // Submit transcription job with diarization.
      const submitted = (await aaFetch(
        "/transcript",
        {
          method: "POST",
          body: JSON.stringify({
            audio_url: signed.signedUrl,
            speaker_labels: true,
            punctuate: true,
            format_text: true,
          }),
        },
        apiKey,
      )) as AATranscript;

      // Poll until completed.
      const started = Date.now();
      let result: AATranscript = submitted;
      while (result.status !== "completed" && result.status !== "error") {
        if (Date.now() - started > 1000 * 60 * 10) {
          return { ok: false as const, error: "Transcription timed out after 10 minutes." };
        }
        await new Promise((r) => setTimeout(r, 3000));
        result = (await aaFetch(`/transcript/${submitted.id}`, { method: "GET" }, apiKey)) as AATranscript;
      }

      if (result.status === "error") {
        return { ok: false as const, error: result.error ?? "Transcription failed." };
      }

      const utts = result.utterances ?? [];
      const segments = utts.map((u, i) => ({
        id: `aa-${submitted.id}-${i}`,
        speaker: `Speaker ${u.speaker}`,
        text: u.text,
        startMs: u.start,
        endMs: u.end,
      }));

      // If no utterances (e.g. single speaker), fall back to one block of text.
      if (!segments.length && result.text) {
        segments.push({
          id: `aa-${submitted.id}-0`,
          speaker: "Speaker A",
          text: result.text,
          startMs: 0,
          endMs: 0,
        });
      }

      // Persist as the session transcript.
      const { error: updErr } = await supabase
        .from("sessions")
        .update({ transcript: segments as unknown as never })
        .eq("id", data.sessionId);
      if (updErr) return { ok: false as const, error: updErr.message };

      return { ok: true as const, segments };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Diarization failed" };
    }
  });
