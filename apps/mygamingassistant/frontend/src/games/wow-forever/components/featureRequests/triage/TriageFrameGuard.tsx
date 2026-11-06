import { useState, type ReactNode } from "react";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { isFramedContext } from "@/games/wow-forever/lib/featureRequests/triage/isFramedContext";

interface TriageFrameGuardProps {
  children: ReactNode;
}

/**
 * Inside the Discord Activity or any frame the triage screen never mounts its unlock form — only this
 * static notice. (Not gated on read-only: serve-only prod is read-only and triage still runs there.)
 */
export default function TriageFrameGuard({ children }: TriageFrameGuardProps) {
  const [framed] = useState(isFramedContext);
  if (!framed) return children;
  return (
    <main className="mx-auto max-w-md p-4 sm:p-8">
      <section className="space-y-2 rounded-xl border bg-card p-6" data-testid="triage-frame-notice">
        <h1 className="text-lg font-semibold">{TRIAGE_COPY.frameNotice}</h1>
        <p className="text-sm text-muted-foreground">{TRIAGE_COPY.frameNoticeBody}</p>
      </section>
    </main>
  );
}
