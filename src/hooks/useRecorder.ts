import { useEffect, useRef, useState, useCallback } from "react";

export type RecorderState = "idle" | "recording" | "paused" | "stopped";

export interface RecorderHook {
  state: RecorderState;
  durationSeconds: number;
  level: number; // 0..1 for waveform/meter
  blob: Blob | null;
  mimeType: string | null;
  error: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob | null>;
  reset: () => void;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
  }
  return "audio/webm";
}

export function useRecorder(): RecorderHook {
  const [state, setState] = useState<RecorderState>("idle");
  const [durationSeconds, setDuration] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const visualize = useCallback(() => {
    const a = analyserRef.current;
    if (!a) return;
    const data = new Uint8Array(a.frequencyBinCount);
    const loop = () => {
      a.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, rms * 2.2));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      setBlob(null);
      chunksRef.current = [];
      accumulatedRef.current = 0;
      setDuration(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      mediaRef.current = rec;
      setMime(mime);

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const out = new Blob(chunksRef.current, { type: mime });
        setBlob(out);
      };

      // Setup analyser
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      visualize();

      rec.start(1000);
      startedAtRef.current = Date.now();
      tickRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setDuration(accumulatedRef.current + elapsed);
      }, 250);
      setState("recording");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Microphone access denied";
      setError(msg);
      cleanup();
      setState("idle");
    }
  }, [cleanup, visualize]);

  const pause = useCallback(() => {
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.pause();
      accumulatedRef.current += (Date.now() - startedAtRef.current) / 1000;
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
      setState("paused");
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRef.current?.state === "paused") {
      mediaRef.current.resume();
      startedAtRef.current = Date.now();
      tickRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setDuration(accumulatedRef.current + elapsed);
      }, 250);
      setState("recording");
    }
  }, []);

  const stop = useCallback(async () => {
    return new Promise<Blob | null>((resolve) => {
      const rec = mediaRef.current;
      if (!rec || rec.state === "inactive") {
        cleanup();
        setState("stopped");
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const out = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setBlob(out);
        if (state === "recording") {
          accumulatedRef.current += (Date.now() - startedAtRef.current) / 1000;
        }
        setDuration(accumulatedRef.current);
        cleanup();
        setState("stopped");
        resolve(out);
      };
      rec.stop();
    });
  }, [cleanup, state]);

  const reset = useCallback(() => {
    cleanup();
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setDuration(0);
    setBlob(null);
    setLevel(0);
    setState("idle");
    setError(null);
  }, [cleanup]);

  return { state, durationSeconds, level, blob, mimeType, error, start, pause, resume, stop, reset };
}
