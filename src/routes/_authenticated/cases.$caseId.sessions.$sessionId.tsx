import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Mic, MicOff, Pause, Play, Square, Flag, Loader2,
  Download, FileText, AlertCircle, CheckCircle2, Save, UserCircle, Sparkles, ShieldAlert, Activity,
} from "lucide-react";
import { diarizeSession } from "@/lib/diarize.functions";
import { updateSession, listSessionAudit, logExport } from "@/lib/sessions.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRecorder } from "@/hooks/useRecorder";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Waveform } from "@/components/Waveform";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatTime, formatDate } from "@/lib/format";
import { saveCache, loadCache, clearCache } from "@/lib/idb";
import type { Bookmark, TranscriptSegment } from "@/lib/types";
import { ConsentDialog, consent } from "@/components/ConsentDialog";
import { usePlaybackUrl } from "@/hooks/usePlaybackUrl";
import { useExportJob, type ExportKind } from "@/hooks/useExportJob";

export const Route = createFileRoute("/_authenticated/cases/$caseId/sessions/$sessionId")({
  component: SessionPage,
});

interface SessionRow {
  id: string;
  title: string;
  case_id: string;
  audio_path: string | null;
  audio_mime: string | null;
  duration_seconds: number;
  transcript: TranscriptSegment[];
  bookmarks: Bookmark[];
  started_at: string;
  ended_at: string | null;
}
interface CaseRow { id: string; case_name: string; suit_number: string; plaintiff: string; defendant: string }

const SPEAKERS = ["Speaker 1 (Judge)", "Speaker 2 (Counsel)", "Speaker 3 (Witness)", "Speaker 4 (Clerk)"];

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function SessionPage() {
  const { caseId, sessionId } = Route.useParams();
  const { user } = useAuth();
  const recorder = useRecorder();
  const sr = useSpeechRecognition();

  const [loading, setLoading] = useState(true);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState(SPEAKERS[0]);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [persisting, setPersisting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [diarizing, setDiarizing] = useState(false);
  const [permissionDialog, setPermissionDialog] = useState(false);
  const [consentDialog, setConsentDialog] = useState(false);
  const [auditRows, setAuditRows] = useState<Array<{ id: string; action: "insert" | "update"; actor_user_id: string | null; changed_fields: string[]; occurred_at: string }>>([]);
  const diarize = useServerFn(diarizeSession);
  const updateSessionFn = useServerFn(updateSession);
  const fetchAudit = useServerFn(listSessionAudit);
  const logExportFn = useServerFn(logExport);

  const playbackUrl = usePlaybackUrl(audioUrl, recorder.blob);
  const uploadingRef = useRef(false);

  const isSecure = typeof window !== "undefined" ? window.isSecureContext : true;
  const browserHint = (() => {
    if (typeof navigator === "undefined") return "";
    const ua = navigator.userAgent;
    if (/Firefox\//.test(ua)) return "firefox";
    if (/Edg\//.test(ua)) return "edge";
    if (/Chrome\//.test(ua)) return "chrome";
    if (/Safari\//.test(ua)) return "safari";
    return "other";
  })();

  /**
   * saveAudioBlob — contract:
   *   Responsibility: upload the recording blob to Supabase Storage, persist
   *     the audio path + metadata via updateSession, refresh the signed URL,
   *     and clear the local IndexedDB cache. Single upload pathway; safe to
   *     call from stopRec, from a retry action, or from runDiarization when a
   *     local blob exists but no audio_path is set yet.
   *   Guarantees: never uploads twice concurrently (uploadingRef); on failure
   *     preserves the in-memory blob so retry is safe.
   */
  const saveAudioBlob = async (blob: Blob): Promise<{ path: string; signedUrl: string | null }> => {
    if (!user) throw new Error("Not signed in");
    if (uploadingRef.current) throw new Error("Upload already in progress");
    uploadingRef.current = true;
    try {
      setPersisting(true);
      const ext = (recorder.mimeType?.includes("mp4") ? "m4a" : recorder.mimeType?.includes("ogg") ? "ogg" : "webm");
      const path = `${user.id}/${sessionId}.${ext}`;
      const { error: upErr } = await supabase.storage.from("session-audio").upload(path, blob, {
        contentType: recorder.mimeType ?? "audio/webm", upsert: true,
      });
      if (upErr) throw upErr;
      await updateSessionFn({
        data: {
          sessionId,
          caseId,
          patch: {
            audio_path: path,
            audio_mime: recorder.mimeType ?? null,
            duration_seconds: Math.round(durationRef.current),
            transcript: transcript as unknown[],
            bookmarks: bookmarks as unknown[],
            ended_at: new Date().toISOString(),
          },
        },
      });
      const { data: signed } = await supabase.storage.from("session-audio").createSignedUrl(path, 3600);
      const signedUrl = signed?.signedUrl ?? null;
      if (signedUrl) setAudioUrl(signedUrl);
      await clearCache(sessionId);
      return { path, signedUrl };
    } finally {
      uploadingRef.current = false;
      setPersisting(false);
    }
  };

  const runDiarization = async () => {
    // Auto-upload path: if a local blob exists but no audio_path is persisted,
    // upload first so the server function has something to diarize.
    if (!session?.audio_path && recorder.blob) {
      const uploadTid = toast.loading("Uploading audio before diarization…");
      try {
        await saveAudioBlob(recorder.blob);
        toast.success("Audio uploaded", { id: uploadTid });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed", {
          id: uploadTid,
          action: { label: "Retry", onClick: () => void runDiarization() },
        });
        return;
      }
    }
    setDiarizing(true);
    const tid = toast.loading("Running speaker diarization…");
    try {
      const res = await diarize({ data: { sessionId } });
      if (res.ok) {
        setTranscript(res.segments as TranscriptSegment[]);
        toast.success(`Diarization complete · ${res.segments.length} segments`, { id: tid });
      } else {
        toast.error(res.error, {
          id: tid,
          action: { label: "Retry", onClick: () => void runDiarization() },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diarization failed", {
        id: tid,
        action: { label: "Retry", onClick: () => void runDiarization() },
      });
    } finally {
      setDiarizing(false);
    }
  };

  const durationRef = useRef(0);
  durationRef.current = recorder.durationSeconds;

  // Load session + case
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: s, error: se }, { data: c }] = await Promise.all([
        supabase.from("sessions").select("*").eq("id", sessionId).maybeSingle(),
        supabase.from("cases").select("id,case_name,suit_number,plaintiff,defendant").eq("id", caseId).maybeSingle(),
      ]);
      if (se) toast.error(se.message);
      if (s) {
        const row = s as unknown as SessionRow;
        setSession(row);
        setTranscript((row.transcript as TranscriptSegment[]) ?? []);
        setBookmarks((row.bookmarks as Bookmark[]) ?? []);
        if (row.audio_path) {
          const { data: signed } = await supabase.storage.from("session-audio").createSignedUrl(row.audio_path, 3600);
          if (signed?.signedUrl) setAudioUrl(signed.signedUrl);
        }
      }
      setCaseRow((c as CaseRow) ?? null);
      // Try local cache restore (only if cloud has no transcript yet)
      const cached = await loadCache(sessionId);
      if (cached && (!s || ((s as unknown as SessionRow).transcript ?? []).length === 0)) {
        if (cached.transcript.length) setTranscript(cached.transcript as TranscriptSegment[]);
        if (cached.bookmarks.length) setBookmarks(cached.bookmarks as Bookmark[]);
        toast.info("Restored unsaved data from local cache.");
      }
      setLoading(false);
    })();
  }, [sessionId, caseId]);

  // Append finals from speech recognition
  useEffect(() => {
    if (!sr.finals.length) return;
    setTranscript((prev) => {
      const next = [...prev];
      for (const f of sr.finals) {
        const last = next[next.length - 1];
        if (last && last.speaker === currentSpeaker && f.timeMs - last.endMs < 4000) {
          next[next.length - 1] = { ...last, text: `${last.text} ${f.text}`.trim(), endMs: f.timeMs };
        } else {
          next.push({ id: uid(), speaker: currentSpeaker, text: f.text, startMs: f.timeMs, endMs: f.timeMs });
        }
      }
      return next;
    });
    sr.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sr.finals]);

  // Auto-save to IndexedDB
  useEffect(() => {
    const t = setInterval(() => {
      saveCache({
        id: sessionId, caseId,
        transcript, bookmarks,
        durationSeconds: durationRef.current,
        audioBlob: recorder.blob ?? undefined,
        audioMime: recorder.mimeType ?? undefined,
        updatedAt: Date.now(),
      }).then(() => setSavedAt(Date.now())).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [sessionId, caseId, transcript, bookmarks, recorder.blob, recorder.mimeType]);

  const beginRecording = async () => {
    if (!isSecure) {
      toast.error("Microphone requires a secure (HTTPS) context.");
      return;
    }
    // Start the recorder FIRST so a SpeechRecognition failure never blocks capture.
    try {
      await recorder.start();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start microphone";
      if (/denied|permission/i.test(msg)) setPermissionDialog(true);
      else toast.error(msg);
      return;
    }
    // Then attempt live captions (best-effort — Firefox/Safari will no-op).
    if (sr.supported) {
      try { sr.start(() => durationRef.current * 1000); } catch { /* surfaced via sr.error */ }
    }
    if (recorder.error) toast.error(recorder.error);
  };
  const startRec = () => {
    if (!consent.granted()) {
      setConsentDialog(true);
      return;
    }
    // Keep synchronous inside the click gesture — do not await.
    void beginRecording();
  };
  const pauseRec = () => { recorder.pause(); sr.stop(); };
  const resumeRec = () => {
    recorder.resume();
    if (sr.supported) {
      try { sr.start(() => durationRef.current * 1000); } catch { /* ignore */ }
    }
  };
  const stopRec = async () => {
    sr.stop();
    const blob = await recorder.stop();
    if (blob && user) {
      try {
        await saveAudioBlob(blob);
        toast.success("Session saved");
        loadAudit();
        // Kick off real speaker diarization in the background.
        void runDiarization();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to save";
        toast.error(msg, {
          action: {
            label: "Retry",
            onClick: () => {
              if (recorder.blob) void saveAudioBlob(recorder.blob).then(() => {
                toast.success("Session saved");
                loadAudit();
              }).catch((err) => toast.error(err instanceof Error ? err.message : "Retry failed"));
            },
          },
        });
      }
    }
  };

  const addBookmark = () => {
    const label = bookmarkLabel.trim() || "Flag";
    setBookmarks((p) => [...p, { id: uid(), label, timeMs: durationRef.current * 1000, createdAt: new Date().toISOString() }]);
    setBookmarkLabel("");
    toast.success(`Flagged at ${formatTime(durationRef.current)}`);
  };

  const loadAudit = async () => {
    try {
      const { rows } = await fetchAudit({ data: { sessionId } });
      setAuditRows(rows);
    } catch { /* non-fatal */ }
  };

  useEffect(() => { loadAudit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sessionId]);

  const saveTranscriptOnly = async () => {
    setPersisting(true);
    try {
      await updateSessionFn({
        data: {
          sessionId,
          caseId,
          patch: {
            transcript: transcript as unknown[],
            bookmarks: bookmarks as unknown[],
            duration_seconds: Math.round(durationRef.current),
          },
        },
      });
      toast.success("Saved");
      loadAudit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPersisting(false);
    }
  };

  // Export job — single toast surface with progress, retry, and cancel.
  const exportJob = useExportJob(() => ({
    caseRow,
    session: session ? { id: session.id, title: session.title, started_at: session.started_at, duration_seconds: session.duration_seconds } : null,
    transcript,
    bookmarks,
    durationSeconds: durationRef.current,
    sessionId,
    caseId,
    blob: recorder.blob,
    mimeType: recorder.mimeType,
    audioUrl,
    logExport: logExportFn,
  }));
  const runExport = (kind: ExportKind) => {
    if (kind !== "audio" && (!caseRow || !session)) {
      toast.error("Session not ready to export");
      return;
    }
    if (kind !== "docx" && !recorder.blob && !audioUrl) {
      toast.error("No audio available", { description: "Record or upload audio first." });
      return;
    }
    exportJob.run(kind);
  };

  const recordingState = recorder.state;
  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";

  const totalSegments = transcript.length;
  const interimDisplay = sr.interim;

  const sortedBookmarks = useMemo(() => [...bookmarks].sort((a, b) => a.timeMs - b.timeMs), [bookmarks]);

  if (loading) return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link to="/cases/$caseId" params={{ caseId }}><ArrowLeft className="size-4" /> Back to case</Link>
      </Button>

      {caseRow && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-5">
          <h1 className="text-xl font-semibold tracking-tight">{caseRow.case_name}</h1>
          <span className="text-xs font-mono text-muted-foreground">{caseRow.suit_number}</span>
          {session && <span className="text-xs text-muted-foreground">· {formatDate(session.started_at)}</span>}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_minmax(320px,420px)] gap-6">
        {/* Left: recorder + transcript */}
        <div className="space-y-4 min-w-0">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`size-3 rounded-full ${isRecording ? "bg-destructive recording-pulse" : isPaused ? "bg-warning" : "bg-muted-foreground/40"}`} />
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    {isRecording ? "Recording" : isPaused ? "Paused" : recordingState === "stopped" ? "Stopped" : "Idle"}
                  </div>
                  <div className="text-2xl font-mono tabular-nums tracking-tight">{formatTime(recorder.durationSeconds || (session?.duration_seconds ?? 0))}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {recordingState === "idle" || recordingState === "stopped" ? (
                  <Button onClick={startRec} disabled={persisting}><Mic className="size-4" /> Record</Button>
                ) : null}
                {isRecording && <Button onClick={pauseRec} variant="secondary"><Pause className="size-4" /> Pause</Button>}
                {isPaused && <Button onClick={resumeRec}><Play className="size-4" /> Resume</Button>}
                {(isRecording || isPaused) && (
                  <Button onClick={stopRec} variant="destructive"><Square className="size-4" /> Stop</Button>
                )}
              </div>
            </div>

            <Waveform level={recorder.level} active={isRecording} />

            {recorder.error && (
              <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 mt-0.5 shrink-0" /><span>{recorder.error}</span>
              </div>
            )}
            {(!sr.supported || browserHint === "firefox" || browserHint === "safari") && (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground/90">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 mt-0.5 shrink-0 text-warning" />
                  <div className="space-y-1">
                    <p className="font-medium">
                      {browserHint === "firefox" && "Firefox has limited recording support"}
                      {browserHint === "safari" && "Safari has limited recording support"}
                      {browserHint !== "firefox" && browserHint !== "safari" && "Live transcription not supported on this browser"}
                    </p>
                    <p className="text-muted-foreground">
                      {browserHint === "firefox" && "Firefox does not support the Web Speech API used for live transcription. Audio recording will still work, and you can run AI diarization on the recorded audio afterwards. For live captions, use Chrome or Edge."}
                      {browserHint === "safari" && "Safari's microphone and speech features can behave inconsistently. Live transcription is unavailable; audio recording works but may require re-granting mic permission each session. For best results, use Chrome or Edge on desktop."}
                      {browserHint !== "firefox" && browserHint !== "safari" && "Live transcription requires a Chromium‑based browser (Chrome, Edge). Audio recording still works and AI diarization can be run afterwards."}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {audioUrl && recordingState !== "recording" && (
              <audio controls src={audioUrl} className="w-full mt-4" />
            )}
          </Card>

          {/* Diagnostics */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Diagnostics</h3>
              <Badge variant="outline" className="text-[10px] ml-auto">Live</Badge>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <DiagRow label="Secure context (HTTPS)" ok={isSecure} value={isSecure ? "yes" : "no — required"} />
              <DiagRow
                label="Microphone permission"
                ok={recorder.permission === "granted"}
                warn={recorder.permission === "prompt" || recorder.permission === "unknown"}
                value={recorder.permission}
              />
              <DiagRow
                label="Recorder state"
                ok={isRecording}
                warn={isPaused}
                value={recordingState}
              />
              <DiagRow
                label="Input device"
                ok={!!recorder.deviceLabel}
                value={recorder.deviceLabel ?? "not opened"}
              />
              <DiagRow
                label="Audio level"
                ok={recorder.level > 0.02}
                warn={isRecording && recorder.level <= 0.02}
                value={`${Math.round(recorder.level * 100)}%`}
              />
              <DiagRow
                label="Encoder MIME"
                ok={!!recorder.mimeType}
                value={recorder.mimeType ?? "—"}
              />
              <DiagRow
                label="Speech recognition supported"
                ok={sr.supported}
                value={sr.supported ? "yes" : "no (use Chrome/Edge)"}
              />
              <DiagRow
                label="Speech recognition state"
                ok={sr.active}
                warn={!sr.active && isRecording && sr.supported}
                value={sr.active ? "listening" : "stopped"}
              />
              {sr.error && (
                <div className="sm:col-span-2 flex items-start gap-2 text-destructive">
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                  <span>Speech recognition error: {sr.error}</span>
                </div>
              )}
              {recorder.permission === "denied" && (
                <div className="sm:col-span-2">
                  <Button size="sm" variant="outline" onClick={() => setPermissionDialog(true)}>
                    <ShieldAlert className="size-4" /> How to grant microphone access
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Speaker + bookmark controls */}
          <Card className="p-4">
            <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><UserCircle className="size-3.5" /> Active speaker</label>
                <Select value={currentSpeaker} onValueChange={setCurrentSpeaker}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPEAKERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Flag note</label>
                <Input value={bookmarkLabel} onChange={(e) => setBookmarkLabel(e.target.value)} placeholder="e.g. Objection overruled" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBookmark(); } }} />
              </div>
              <Button onClick={addBookmark} variant="secondary"><Flag className="size-4" /> Flag</Button>
            </div>
          </Card>

          {/* Transcript */}
          <Card className="p-0">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <h2 className="font-medium">Transcript</h2>
                <Badge variant="outline" className="text-[10px]">{totalSegments} segment{totalSegments === 1 ? "" : "s"}</Badge>
                {sr.active && <Badge className="text-[10px]">Live</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {savedAt && <span className="text-[11px] text-muted-foreground hidden sm:inline">Local cache · {new Date(savedAt).toLocaleTimeString()}</span>}
                <Button size="sm" variant="ghost" onClick={runDiarization} disabled={diarizing || recordingState === "recording" || recordingState === "paused"} title="Run AI speaker diarization on the recorded audio">
                  {diarizing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Diarize
                </Button>
                <Button size="sm" variant="ghost" onClick={saveTranscriptOnly} disabled={persisting}><Save className="size-4" /> Save</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline"><Download className="size-4" /> Export</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Download</DropdownMenuLabel>
                    <DropdownMenuItem onClick={exportDocx}><FileText className="size-4" /> Transcript (.docx)</DropdownMenuItem>
                    <DropdownMenuItem onClick={exportAudio}><Mic className="size-4" /> Audio file</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={exportBoth}>Both</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <ScrollArea className="h-[460px]">
              <div className="p-4 space-y-3">
                {transcript.length === 0 && !interimDisplay && (
                  <div className="text-sm text-muted-foreground text-center py-12">
                    {isRecording ? "Listening… speak to populate the transcript." : "Press Record to begin capturing audio and live transcription."}
                  </div>
                )}
                {transcript.map((seg) => (
                  <div key={seg.id} className="group">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[11px] font-mono text-primary tabular-nums">{formatTime(seg.startMs / 1000)}</span>
                      <span className="text-xs font-medium text-foreground/90">{seg.speaker}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/95 pl-1">{seg.text}</p>
                  </div>
                ))}
                {interimDisplay && (
                  <div>
                    <div className="text-[11px] font-mono text-muted-foreground tabular-nums mb-0.5">{formatTime(durationRef.current)}</div>
                    <p className="text-sm italic text-muted-foreground pl-1">{interimDisplay}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Right: bookmarks panel */}
        <div className="space-y-4">
          <Card className="p-0">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Flag className="size-4 text-warning" />
              <h2 className="font-medium">Bookmarks</h2>
              <Badge variant="outline" className="text-[10px]">{bookmarks.length}</Badge>
            </div>
            <div className="p-3 max-h-[420px] overflow-auto">
              {sortedBookmarks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No flags yet. Drop one with the Flag button.</p>
              ) : (
                <ul className="space-y-2">
                  {sortedBookmarks.map((b) => (
                    <li key={b.id} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/40 border border-border">
                      <span className="mt-0.5 text-[11px] font-mono tabular-nums text-warning shrink-0">{formatTime(b.timeMs / 1000)}</span>
                      <span className="text-sm flex-1 break-words">{b.label}</span>
                      <button onClick={() => setBookmarks((p) => p.filter((x) => x.id !== b.id))} className="text-xs text-muted-foreground hover:text-destructive">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="p-0">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <h2 className="font-medium">Activity</h2>
              <Badge variant="outline" className="text-[10px]">{auditRows.length}</Badge>
            </div>
            <div className="p-3 max-h-[280px] overflow-auto">
              {auditRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No activity recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {auditRows.map((a) => (
                    <li key={a.id} className="text-xs p-2 rounded-md bg-muted/40 border border-border">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={a.action === "insert" ? "default" : "outline"} className="text-[10px] capitalize">{a.action}</Badge>
                        <span className="font-mono tabular-nums text-muted-foreground">{new Date(a.occurred_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-muted-foreground truncate" title={a.actor_user_id ?? ""}>
                        by {a.actor_user_id ? `${a.actor_user_id.slice(0, 8)}…` : "system"}
                        {a.changed_fields.length > 0 && (
                          <span> · {a.changed_fields.join(", ")}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>


          <Card className="p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Status</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-center justify-between"><span>Microphone</span><Badge variant={recorder.error ? "destructive" : "outline"}>{recorder.error ? "Blocked" : "Ready"}</Badge></li>
              <li className="flex items-center justify-between"><span>Live transcription</span><Badge variant={sr.supported ? "outline" : "secondary"}>{sr.supported ? (sr.active ? "Active" : "Idle") : "Unsupported"}</Badge></li>
              <li className="flex items-center justify-between"><span>Local auto‑save</span><Badge variant="outline">{savedAt ? "Active" : "Standby"}</Badge></li>
              <li className="flex items-center justify-between"><span>Cloud sync</span><Badge variant="outline">{persisting ? "Saving…" : "Synced"}</Badge></li>
            </ul>
          </Card>
        </div>
      </div>

      <PermissionDialog
        open={permissionDialog}
        onOpenChange={setPermissionDialog}
        browser={browserHint}
        onRetry={() => { setPermissionDialog(false); startRec(); }}
      />
      <ConsentDialog
        open={consentDialog}
        onConfirm={() => { consent.grant(); setConsentDialog(false); void beginRecording(); }}
        onCancel={() => setConsentDialog(false)}
      />
    </div>
  );
}

function DiagRow({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  const dot = ok ? "bg-success" : warn ? "bg-warning" : "bg-muted-foreground/40";
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="flex items-center gap-1.5 font-mono tabular-nums truncate">
        <span className={`size-1.5 rounded-full ${dot}`} />
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

function PermissionDialog({
  open, onOpenChange, browser, onRetry,
}: { open: boolean; onOpenChange: (v: boolean) => void; browser: string; onRetry: () => void }) {
  const steps: Record<string, string[]> = {
    chrome: [
      "Click the tune/lock icon at the left of the address bar.",
      "Find Microphone and switch it to Allow.",
      "Reload the page, then press Record again.",
    ],
    edge: [
      "Click the lock icon at the left of the address bar.",
      "Set Microphone to Allow.",
      "Reload the page and press Record.",
    ],
    firefox: [
      "Click the lock icon at the left of the address bar.",
      "Open Connection settings → Permissions and remove the 'Block' for Microphone.",
      "Reload the page and press Record.",
    ],
    safari: [
      "Open Safari → Settings → Websites → Microphone.",
      "Set this site to Allow.",
      "Reload the page and press Record.",
    ],
    other: [
      "Open the site permissions in your browser address bar.",
      "Allow microphone access for this site.",
      "Reload and try again.",
    ],
  };
  const list = steps[browser] ?? steps.other;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MicOff className="size-5 text-destructive" /> Microphone access required
          </DialogTitle>
          <DialogDescription>
            myJuris needs microphone access to record audio and generate a transcript.
            Your browser has blocked or denied the request.
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm">
          <p className="font-medium mb-2">To grant access:</p>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            {list.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Recording requires a secure (HTTPS) page. Make sure no other app is currently using the microphone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={onRetry}><Mic className="size-4" /> Try again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
