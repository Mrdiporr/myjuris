import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Scale, ShieldCheck, Mic, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — Lex Recorder" }] }),
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-brand text-primary-foreground relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-background/15 grid place-items-center backdrop-blur">
            <Scale className="size-6" />
          </div>
          <div className="font-semibold text-lg tracking-tight">Lex Recorder</div>
        </div>
        <div className="space-y-6 max-w-md relative z-10">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">Court of record, in your browser.</h1>
          <p className="text-primary-foreground/80 text-sm leading-relaxed">Record proceedings, capture live transcripts, and flag pivotal moments. Built for clerks, counsel, and the bench.</p>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3"><Mic className="size-5 mt-0.5 shrink-0" /><span>High‑fidelity audio capture with pause &amp; resume.</span></li>
            <li className="flex gap-3"><FileText className="size-5 mt-0.5 shrink-0" /><span>Live speech‑to‑text with timestamped segments.</span></li>
            <li className="flex gap-3"><ShieldCheck className="size-5 mt-0.5 shrink-0" /><span>Private to your account; auto‑saved locally and to the cloud.</span></li>
          </ul>
        </div>
        <div className="text-xs text-primary-foreground/60">© Lex Recorder · Secure legal technology</div>
        <div className="absolute -right-32 -bottom-32 size-[420px] rounded-full bg-background/10 blur-3xl" />
      </div>
      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md p-8 shadow-elevated">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
            <p className="text-sm text-muted-foreground mt-1">{mode === "signin" ? "Access your case archive." : "Begin recording in minutes."}</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="clerk@court.gov" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-muted-foreground text-center">
            {mode === "signin" ? (
              <>New here? <button type="button" className="text-primary hover:underline" onClick={() => setMode("signup")}>Create an account</button></>
            ) : (
              <>Already registered? <button type="button" className="text-primary hover:underline" onClick={() => setMode("signin")}>Sign in</button></>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
