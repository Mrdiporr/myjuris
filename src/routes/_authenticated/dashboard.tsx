import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Folder, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import type { CaseStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Case Directory — Lex Recorder" }] }),
});

interface CaseRow {
  id: string;
  case_name: string;
  suit_number: string;
  plaintiff: string;
  defendant: string;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
}

function statusVariant(s: CaseStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "Active") return "default";
  if (s === "Adjourned") return "secondary";
  return "outline";
}

function Dashboard() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CaseStatus>("all");
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cases").select("*").order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setCases((data as CaseRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!s) return true;
      return c.case_name.toLowerCase().includes(s) || c.suit_number.toLowerCase().includes(s);
    });
  }, [cases, search, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Case Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage cases and start recording sessions.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4" /> New case</Button>
          </DialogTrigger>
          <NewCaseDialog
            userId={user!.id}
            onCreated={() => { setOpen(false); load(); }}
            existingSuitNumbers={cases.map((c) => c.suit_number.trim().toLowerCase())}
          />
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by case name or suit number" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Adjourned">Adjourned</SelectItem>
            <SelectItem value="Disposed">Disposed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Folder className="size-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium">No cases yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create your first case to begin recording.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Link key={c.id} to="/cases/$caseId" params={{ caseId: c.id }}>
              <Card className="p-5 hover:border-primary/60 hover:shadow-elevated transition-all cursor-pointer h-full flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.case_name}</div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">{c.suit_number}</div>
                  </div>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-1 flex-1">
                  <div className="truncate"><span className="text-foreground/70">Plaintiff:</span> {c.plaintiff}</div>
                  <div className="truncate"><span className="text-foreground/70">Defendant:</span> {c.defendant}</div>
                </div>
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><FileText className="size-3.5" /> View case</span>
                  <span>{formatDate(c.updated_at)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCaseDialog({ userId, onCreated, existingSuitNumbers }: { userId: string; onCreated: () => void; existingSuitNumbers: string[] }) {
  const [caseName, setCaseName] = useState("");
  const [suitNumber, setSuitNumber] = useState("");
  const [plaintiff, setPlaintiff] = useState("");
  const [defendant, setDefendant] = useState("");
  const [status, setStatus] = useState<CaseStatus>("Active");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = suitNumber.trim();
    if (existingSuitNumbers.includes(trimmed.toLowerCase())) {
      toast.error("Suit number already exists. Please use a unique number.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("cases").insert({
      user_id: userId,
      case_name: caseName.trim(),
      suit_number: trimmed,
      plaintiff: plaintiff.trim(),
      defendant: defendant.trim(),
      status,
    });
    setBusy(false);
    if (error) {
      if (error.code === "23505") toast.error("Suit number already exists. Please use a unique number.");
      else toast.error(error.message);
      return;
    }
    toast.success("Case created");
    onCreated();
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>New case</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="case_name">Case name</Label>
          <Input id="case_name" required value={caseName} onChange={(e) => setCaseName(e.target.value)} placeholder="The People v. John Doe" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="suit_number">Suit number <span className="text-muted-foreground text-xs">(must be unique)</span></Label>
          <Input id="suit_number" required value={suitNumber} onChange={(e) => setSuitNumber(e.target.value)} placeholder="HC/123/2025" className="font-mono" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="plaintiff">Plaintiff</Label>
            <Input id="plaintiff" required value={plaintiff} onChange={(e) => setPlaintiff(e.target.value)} placeholder="Plaintiff name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defendant">Defendant</Label>
            <Input id="defendant" required value={defendant} onChange={(e) => setDefendant(e.target.value)} placeholder="Defendant name" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as CaseStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Adjourned">Adjourned</SelectItem>
              <SelectItem value="Disposed">Disposed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create case"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
