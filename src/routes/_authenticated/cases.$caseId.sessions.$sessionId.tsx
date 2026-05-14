import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Mic, Pause, Play, Square, Flag, Loader2,
  Download, FileText, AlertCircle, CheckCircle2, Save, UserCircle, Sparkles,
} from "lucide-react";
import { diarizeSession } from "@/lib/diarize.functions";
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
import { toast } from "sonner";
import { formatTime, formatDate } from "@/lib/format";
import { saveCache, loadCache, clearCache } from "@/lib/idb";
import type { Bookmark, TranscriptSegment } from "@/lib/types";
import { exportTranscriptDocx, downloadBlob } from "@/lib/export";

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
  const diarize = useServerFn(diarizeSession);

  const runDiarization = async () => {
    setDiarizing(true);
    const tid = toast.loading("Running speaker diarization…");
    try {
      const res = await diarize({ data: { sessionId } });
      if (res.ok) {
        setTranscript(res.segments as TranscriptSegment[]);
        toast.success(`Diarization complete · ${res.segments.length} segments`, { id: tid });
      } else {
        toast.error(res.error, { id: tid });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diarization failed", { id: tid });
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

  const startRec = async () => {
    await recorder.start();
    if (sr.supported) sr.start(() => durationRef.current * 1000);
  };
  const pauseRec = () => { recorder.pause(); sr.stop(); };
  const resumeRec = () => { recorder.resume(); if (sr.supported) sr.start(() => durationRef.current * 1000); };
  const stopRec = async () => {
    sr.stop();
    const blob = await recorder.stop();
    if (blob && user) {
      try {
        setPersisting(true);
        const ext = (recorder.mimeType?.includes("mp4") ? "m4a" : recorder.mimeType?.includes("ogg") ? "ogg" : "webm");
        const path = `${user.id}/${sessionId}.${ext}`;
        const { error: upErr } = await supabase.storage.from("session-audio").upload(path, blob, {
          contentType: recorder.mimeType ?? "audio/webm", upsert: true,
        });
        if (upErr) throw upErr;
        const { error: updErr } = await supabase.from("sessions").update({
          audio_path: path,
          audio_mime: recorder.mimeType,
          duration_seconds: Math.round(durationRef.current),
          transcript: transcript as unknown as never, bookmarks: bookmarks as unknown as never,
          ended_at: new Date().toISOString(),
        }).eq("id", sessionId);
        if (updErr) throw updErr;
        const { data: signed } = await supabase.storage.from("session-audio").createSignedUrl(path, 3600);
        if (signed?.signedUrl) setAudioUrl(signed.signedUrl);
        await clearCache(sessionId);
        toast.success("Session saved");
        // Kick off real speaker diarization in the background.
        runDiarization();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      } finally { setPersisting(false); }
    }
  };

  const addBookmark = () => {
    const label = bookmarkLabel.trim() || "Flag";
    setBookmarks((p) => [...p, { id: uid(), label, timeMs: durationRef.current * 1000, createdAt: new Date().toISOString() }]);
    setBookmarkLabel("");
    toast.success(`Flagged at ${formatTime(durationRef.current)}`);
  };

  const saveTranscriptOnly = async () => {
    setPersisting(true);
    const { error } = await supabase.from("sessions").update({
      transcript: transcript as unknown as never, bookmarks: bookmarks as unknown as never, duration_seconds: Math.round(durationRef.current),
    }).eq("id", sessionId);
    setPersisting(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const exportDocx = async () => {
    if (!caseRow || !session) return;
    const blob = await exportTranscriptDocx({
      caseName: caseRow.case_name, suitNumber: caseRow.suit_number,
      parties: `${caseRow.plaintiff} vs. ${caseRow.defendant}`,
      sessionTitle: session.title, startedAt: session.started_at,
      durationSeconds: Math.round(durationRef.current || session.duration_seconds),
      transcript, bookmarks,
    });
    downloadBlob(blob, `${caseRow.suit_number}_${session.title}.docx`.replace(/\s+/g, "_"));
  };

  const exportAudio = async () => {
    const blob = recorder.blob;
    if (blob) {
      const ext = (recorder.mimeType?.includes("mp4") ? "m4a" : "webm");
      downloadBlob(blob, `${caseRow?.suit_number ?? "session"}_${sessionId}.${ext}`);
      return;
    }
    if (audioUrl) {
      const a = document.createElement("a"); a.href = audioUrl; a.download = `${caseRow?.suit_number ?? "session"}.audio`;
      document.body.appendChild(a); a.click(); a.remove();
    } else { toast.error("No audio available"); }
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
            {!sr.supported && (
              <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <span>Live transcription requires a Chromium‑based browser (Chrome, Edge). Audio recording still works.</span>
              </div>
            )}
            {audioUrl && recordingState !== "recording" && (
              <audio controls src={audioUrl} className="w-full mt-4" />
            )}
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
                    <DropdownMenuItem onClick={async () => { await exportDocx(); await exportAudio(); }}>Both</DropdownMenuItem>
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
    </div>
  );
}
