import { useEffect, useRef } from "react";

interface Props {
  level: number; // 0..1
  active: boolean;
  className?: string;
}

export function Waveform({ level, active, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const hist = historyRef.current;
      hist.push(active ? level : 0.02);
      const barCount = Math.floor(w / 4);
      while (hist.length > barCount) hist.shift();

      const cssVar = (name: string) => getComputedStyle(canvas).getPropertyValue(name).trim();
      const primaryColor = active ? cssVar("--color-primary") || "#3b82f6" : cssVar("--color-muted-foreground") || "#888";
      ctx.fillStyle = primaryColor;
      const cx = w / 2;
      const cy = h / 2;

      for (let i = 0; i < hist.length; i++) {
        const v = hist[i];
        const barH = Math.max(2, v * h * 0.9);
        const x = i * 4;
        ctx.fillRect(x, cy - barH / 2, 2, barH);
      }
      // center line
      ctx.strokeStyle = cssVar("--color-border") || "#333";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();

      // recording dot
      if (active) {
        ctx.beginPath();
        ctx.arc(w - 14, 14, 5, 0, Math.PI * 2);
        ctx.fillStyle = cssVar("--color-destructive") || "#ef4444";
        ctx.fill();
      }
      // suppress unused vars
      void cx;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [level, active]);

  return <canvas ref={canvasRef} className={className ?? "w-full h-24 rounded-md bg-muted/40 border border-border"} />;
}
