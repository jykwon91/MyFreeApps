import { Pizza } from "lucide-react";
import type { PageShellProps } from "@/types/public/PageShellProps";

export default function PageShell({ children }: PageShellProps) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl p-4 sm:p-8 space-y-6">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Pizza className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Desmadre Pizza Drop</h1>
            <p className="text-xs text-muted-foreground">Order pickup</p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
