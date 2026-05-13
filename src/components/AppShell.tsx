import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Scale, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-sidebar/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="size-9 rounded-md bg-gradient-brand grid place-items-center shadow-elevated">
              <Scale className="size-5 text-primary-foreground" strokeWidth={2.25} />
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Lex Recorder</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Court Audio &amp; Transcript</div>
            </div>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard"><LayoutDashboard className="size-4" /> Dashboard</Link>
            </Button>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-[200px]">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Secure courtroom recording · All data stored privately to your account
      </footer>
    </div>
  );
}
