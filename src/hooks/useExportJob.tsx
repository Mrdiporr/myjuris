import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, RotateCw, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { exportTranscriptDocx, downloadBlob } from "@/lib/export";
import type { Bookmark, TranscriptSegment } from "@/lib/types";

export type ExportKind = "docx" | "audio" | "both";

type Stage =
  | "preparing"
  | "building_document"
  | "packaging_audio"
  | "downloading"
  | "logging_audit"
  | "done"
  | "error";

const STAGE_LABEL: Record<Stage, string> = {
  preparing: "Preparing…",
  building_document: "Building document…",
  packaging_audio: "Packaging audio…",
  downloading: "Downloading…",
  logging_audit: "Recording audit entry…",
  done: "Complete",
  error: "Failed",
};

export interface ExportContext {
  caseRow: { case_name: string; suit_number: string; plaintiff: string; defendant: string } | null;
  session: { id: string; title: string; started_at: string; duration_seconds: number } | null;
  transcript: TranscriptSegment[];
  bookmarks: Bookmark[];
  durationSeconds: number;
  sessionId: string;
  caseId: string;
  blob: Blob | null;
  mimeType: string | null;
  audioUrl: string | null;
  logExport: (args: { data: { sessionId: string; caseId: string; kind: "audio" | "transcript_docx"; filename: string } }) => Promise<unknown>;
}

interface JobState {
  status: "idle" | "running" | "done" | "error";
  kind: ExportKind | null;
  stage: Stage;
  percent: number;
  error?: string;
}

/**
 * Contract:
 *   Responsibility: orchestrate a single export job (docx / audio / both) with
 *     coarse progress, cancellation, and retry. Owns exactly one sonner toast
 *     identified by a stable id.
 *   Inputs: `getContext()` returning fresh session data at run time.
 *   Outputs: `{ state, run, retry, cancel }`.
 *   Side effects: creates and updates one toast; triggers file downloads;
 *     calls the provided `logExport` server function.
 *   Failure behaviour: sets status = "error" with an error string, keeps the
 *     toast open with a Retry button that re-runs the failed kind from stage 1.
 *   Cancellation: cooperative — signal is checked between stages.
 *   Guarantees:
 *     - Never runs two jobs concurrently (`runningRef` guard).
 *     - Progress never exceeds 100 %.
 *     - A completed export cannot re-enter running except via explicit retry.
 *     - Every failure path resolves state (no deadlock).
 *   Does NOT own session, recorder, or auth state.
 */
export function useExportJob(getContext: () => ExportContext) {
  const [state, setState] = useState<JobState>({ status: "idle", kind: null, stage: "preparing", percent: 0 });
  const runningRef = useRef(false);
  const cancelRef = useRef<AbortController | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  const renderToast = useCallback((snapshot: JobState, retry: () => void, cancel: () => void) => {
    const id = toastIdRef.current ?? `export-job-${Date.now()}`;
    toastIdRef.current = id;
    const body = (
      <div className="w-[320px] rounded-lg border border-border bg-popover p-3 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          {snapshot.status === "running" && <Loader2 className="size-4 animate-spin text-primary" />}
          {snapshot.status === "done" && <CheckCircle2 className="size-4 text-success" />}
          {snapshot.status === "error" && <XCircle className="size-4 text-destructive" />}
          <div className="text-sm font-medium">
            {snapshot.kind === "docx" && "Transcript export"}
            {snapshot.kind === "audio" && "Audio export"}
            {snapshot.kind === "both" && "Bundle export"}
          </div>
          <span className="ml-auto text-[11px] font-mono tabular-nums text-muted-foreground">
            {Math.min(100, Math.max(0, Math.round(snapshot.percent)))}%
          </span>
        </div>
        <Progress value={Math.min(100, Math.max(0, snapshot.percent))} className="h-1.5" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground truncate">
            {snapshot.status === "error" ? (snapshot.error ?? "Failed") : STAGE_LABEL[snapshot.stage]}
          </span>
          <div className="flex items-center gap-1">
            {snapshot.status === "error" && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={retry}>
                <RotateCw className="size-3" /> Retry
              </Button>
            )}
            {snapshot.status === "running" && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancel}>
                <X className="size-3" /> Cancel
              </Button>
            )}
            {(snapshot.status === "done" || snapshot.status === "error") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  if (toastIdRef.current != null) toast.dismiss(toastIdRef.current);
                  toastIdRef.current = null;
                }}
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </div>
    );
    toast.custom(() => body, { id, duration: snapshot.status === "done" ? 2500 : Infinity });
    return id;
  }, []);

  const setAndRender = useCallback(
    (next: JobState, retry: () => void, cancel: () => void) => {
      setState(next);
      renderToast(next, retry, cancel);
    },
    [renderToast],
  );

  const checkCancel = (signal: AbortSignal) => {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  };

  const doDocx = useCallback(
    async (signal: AbortSignal, base: number, span: number, retry: () => void, cancel: () => void) => {
      const ctx = getContext();
      if (!ctx.caseRow || !ctx.session) throw new Error("Session not ready to export");
      setAndRender({ status: "running", kind: state.kind, stage: "building_document", percent: base + span * 0.1 }, retry, cancel);
      checkCancel(signal);
      const blob = await exportTranscriptDocx({
        caseName: ctx.caseRow.case_name,
        suitNumber: ctx.caseRow.suit_number,
        parties: `${ctx.caseRow.plaintiff} vs. ${ctx.caseRow.defendant}`,
        sessionTitle: ctx.session.title,
        startedAt: ctx.session.started_at,
        durationSeconds: Math.round(ctx.durationSeconds || ctx.session.duration_seconds),
        transcript: ctx.transcript,
        bookmarks: ctx.bookmarks,
      });
      checkCancel(signal);
      setAndRender({ status: "running", kind: state.kind, stage: "downloading", percent: base + span * 0.7 }, retry, cancel);
      const filename = `${ctx.caseRow.suit_number}_${ctx.session.title}.docx`.replace(/\s+/g, "_");
      downloadBlob(blob, filename);
      setAndRender({ status: "running", kind: state.kind, stage: "logging_audit", percent: base + span * 0.9 }, retry, cancel);
      try {
        await ctx.logExport({ data: { sessionId: ctx.sessionId, caseId: ctx.caseId, kind: "transcript_docx", filename } });
      } catch (e) {
        // Audit failure is non-fatal for the download itself, but surface it as a soft warning
        console.error("[export] audit log failed", e);
        toast.warning("Export saved, but audit log failed", { description: filename });
      }
      return filename;
    },
    [getContext, setAndRender, state.kind],
  );

  const doAudio = useCallback(
    async (signal: AbortSignal, base: number, span: number, retry: () => void, cancel: () => void) => {
      const ctx = getContext();
      if (!ctx.blob && !ctx.audioUrl) throw new Error("No audio available — record or upload audio first.");
      setAndRender({ status: "running", kind: state.kind, stage: "packaging_audio", percent: base + span * 0.1 }, retry, cancel);
      checkCancel(signal);
      let filename: string;
      if (ctx.blob) {
        const ext = ctx.mimeType?.includes("mp4") ? "m4a" : ctx.mimeType?.includes("ogg") ? "ogg" : "webm";
        filename = `${ctx.caseRow?.suit_number ?? "session"}_${ctx.sessionId}.${ext}`;
        setAndRender({ status: "running", kind: state.kind, stage: "downloading", percent: base + span * 0.7 }, retry, cancel);
        downloadBlob(ctx.blob, filename);
      } else {
        filename = `${ctx.caseRow?.suit_number ?? "session"}.audio`;
        setAndRender({ status: "running", kind: state.kind, stage: "downloading", percent: base + span * 0.7 }, retry, cancel);
        const a = document.createElement("a");
        a.href = ctx.audioUrl!;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setAndRender({ status: "running", kind: state.kind, stage: "logging_audit", percent: base + span * 0.9 }, retry, cancel);
      try {
        await ctx.logExport({ data: { sessionId: ctx.sessionId, caseId: ctx.caseId, kind: "audio", filename } });
      } catch (e) {
        console.error("[export] audit log failed", e);
        toast.warning("Export saved, but audit log failed", { description: filename });
      }
      return filename;
    },
    [getContext, setAndRender, state.kind],
  );

  const runInternal = useCallback(
    async (kind: ExportKind) => {
      if (runningRef.current) return;
      runningRef.current = true;
      const controller = new AbortController();
      cancelRef.current = controller;
      const retry = () => {
        runningRef.current = false;
        void runInternal(kind);
      };
      const cancel = () => {
        controller.abort();
      };
      // Seed initial toast state with the correct kind
      setState({ status: "running", kind, stage: "preparing", percent: 5 });
      renderToast({ status: "running", kind, stage: "preparing", percent: 5 }, retry, cancel);
      try {
        if (kind === "docx") {
          await doDocx(controller.signal, 0, 100, retry, cancel);
        } else if (kind === "audio") {
          await doAudio(controller.signal, 0, 100, retry, cancel);
        } else {
          await doDocx(controller.signal, 0, 50, retry, cancel);
          await doAudio(controller.signal, 50, 50, retry, cancel);
        }
        const finalState: JobState = { status: "done", kind, stage: "done", percent: 100 };
        setState(finalState);
        renderToast(finalState, retry, cancel);
      } catch (e) {
        const isCancel = e instanceof DOMException && e.name === "AbortError";
        const message = isCancel ? "Cancelled" : e instanceof Error ? e.message : "Export failed";
        const finalState: JobState = { status: "error", kind, stage: "error", percent: 0, error: message };
        setState(finalState);
        renderToast(finalState, retry, cancel);
      } finally {
        runningRef.current = false;
        cancelRef.current = null;
      }
    },
    [doDocx, doAudio, renderToast],
  );

  const run = useCallback((kind: ExportKind) => void runInternal(kind), [runInternal]);
  const retry = useCallback(() => {
    if (state.kind) void runInternal(state.kind);
  }, [runInternal, state.kind]);
  const cancel = useCallback(() => {
    cancelRef.current?.abort();
  }, []);

  return { state, run, retry, cancel };
}
