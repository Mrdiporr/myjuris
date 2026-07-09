import { useEffect, useRef, useState, useCallback } from "react";

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence: number };
  }>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

function getSR(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface LiveTranscriptHook {
  supported: boolean;
  active: boolean;
  interim: string;
  finals: { text: string; timeMs: number }[];
  error: string | null;
  start: (offsetMs: () => number) => void;
  stop: () => void;
  reset: () => void;
  retry: () => void;
}

const MAX_RESTARTS = 10;

export function useSpeechRecognition(): LiveTranscriptHook {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const [finals, setFinals] = useState<{ text: string; timeMs: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const offsetFnRef = useRef<() => number>(() => 0);
  const wantActiveRef = useRef(false);
  const restartCountRef = useRef(0);

  useEffect(() => { setSupported(getSR() !== null); }, []);

  const start = useCallback((offsetMs: () => number) => {
    const SR = getSR();
    if (!SR) { setError("Live transcription not supported in this browser. Try Chrome."); return; }
    offsetFnRef.current = offsetMs;
    wantActiveRef.current = true;
    restartCountRef.current = 0;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      restartCountRef.current = 0; // reset backoff whenever we get real output
      let interimText = "";
      const newFinals: { text: string; timeMs: number }[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0].transcript;
        if (r.isFinal) newFinals.push({ text: txt.trim(), timeMs: offsetFnRef.current() });
        else interimText += txt;
      }
      if (newFinals.length) setFinals((p) => [...p, ...newFinals]);
      setInterim(interimText);
    };
    rec.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      setError(ev.error);
    };
    rec.onend = () => {
      // Bounded auto-restart (browsers cut off ~60s of continuous listening).
      if (wantActiveRef.current && restartCountRef.current < MAX_RESTARTS) {
        restartCountRef.current += 1;
        try { rec.start(); } catch { setActive(false); }
      } else {
        if (wantActiveRef.current && restartCountRef.current >= MAX_RESTARTS) {
          setError("Live captions stopped after repeated restarts. Use Retry to resume.");
        }
        setActive(false);
      }
    };
    try { rec.start(); recRef.current = rec; setActive(true); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not start recognizer"); }
  }, []);

  const stop = useCallback(() => {
    wantActiveRef.current = false;
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setActive(false);
  }, []);

  const reset = useCallback(() => { setInterim(""); setFinals([]); setError(null); }, []);

  const retry = useCallback(() => {
    // Re-start using the last offset function; caller sets a new one via start() if needed.
    setError(null);
    restartCountRef.current = 0;
    start(offsetFnRef.current);
  }, [start]);

  return { supported, active, interim, finals, error, start, stop, reset, retry };
}
