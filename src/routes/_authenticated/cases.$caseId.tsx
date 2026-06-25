import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Mic, Clock, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createSession } from "@/lib/sessions.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDate, formatTime } from "@/lib/format";
import type { CaseStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  component: CaseDetail,
});

interface CaseRow {
  id: string;
  case_name: string;
  suit_number: string;
  plaintiff: string;
  defendant: string;
  status: CaseStatus;
}
interface SessionRow {
  id: string;
  title: string;
  duration_seconds: number;
  started_at: string;
  ended_at: string | null;
  transcript: unknown[];
  bookmarks: unknown[];
}

function CaseDetail() {
  const { caseId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: c, error: ce }, { data: ss, error: se }] = await Promise.all([
        supabase.from("cases").select("*").eq("id", caseId).maybeSingle(),
        supabase.from("sessions").select("id,title,duration_seconds,started_at,ended_at,transcript,bookmarks").eq("case_id", caseId).order("started_at", { ascending: false }),
      ]);
      if (ce) toast.error(ce.message);
      if (se) toast.error(se.message);
      setCaseRow((c as CaseRow) ?? null);
      setSessions((ss as SessionRow[]) ?? []);
      setLoading(false);
    })();
  }, [caseId]);

  const newSession = async () => {
    if (!user) return;
    setCreating(true);
    const { data, error } = await supabase.from("sessions").insert({
      case_id: caseId,
      user_id: user.id,
      title: `Session ${new Date().toLocaleString()}`,
    }).select("id").single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/cases/$caseId/sessions/$sessionId", params: { caseId, sessionId: data.id } });
  };

  if (loading) return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (!caseRow) return <div className="max-w-3xl mx-auto p-8 text-center text-muted-foreground">Case not found.</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/dashboard"><ArrowLeft className="size-4" /> All cases</Link>
      </Button>

      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs font-mono text-muted-foreground">{caseRow.suit_number}</div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">{caseRow.case_name}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              <span className="text-foreground/80">{caseRow.plaintiff}</span>
              <span className="mx-2 text-muted-foreground">vs.</span>
              <span className="text-foreground/80">{caseRow.defendant}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={caseRow.status === "Active" ? "default" : caseRow.status === "Adjourned" ? "secondary" : "outline"}>{caseRow.status}</Badge>
            <Button onClick={newSession} disabled={creating}><Mic className="size-4" /> {creating ? "Starting…" : "New session"}</Button>
          </div>
        </div>
      </Card>

      <h2 className="text-lg font-semibold tracking-tight mb-3">Recording sessions</h2>
      {sessions.length === 0 ? (
        <Card className="p-10 text-center">
          <Mic className="size-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium">No sessions yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Start a recording session to capture audio and live transcript.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} to="/cases/$caseId/sessions/$sessionId" params={{ caseId, sessionId: s.id }}>
              <Card className="p-4 hover:border-primary/60 hover:shadow-elevated transition-all cursor-pointer flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{formatDate(s.started_at)}</div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                  <span className="flex items-center gap-1.5"><Clock className="size-3.5" /> {formatTime(s.duration_seconds)}</span>
                  <span className="flex items-center gap-1.5"><FileText className="size-3.5" /> {(s.transcript as unknown[]).length} segments</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
