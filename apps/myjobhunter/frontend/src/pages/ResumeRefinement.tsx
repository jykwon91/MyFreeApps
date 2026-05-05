import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Skeleton } from "@platform/ui";
import SessionStartPanel from "@/features/resume_refinement/SessionStartPanel";
import CurrentDraftPanel from "@/features/resume_refinement/CurrentDraftPanel";
import PendingProposalCard from "@/features/resume_refinement/PendingProposalCard";
import CompletePanel from "@/features/resume_refinement/CompletePanel";
import { useGetRefinementSessionQuery } from "@/lib/resumeRefinementApi";

const ACTIVE_SESSION_KEY = "mjh:resumeRefinementSessionId";
const POLL_INTERVAL_MS = 3000;

export default function ResumeRefinement() {
  const [sessionId, setSessionId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_SESSION_KEY) : null
  );

  const {
    data: session,
    isLoading,
    error,
  } = useGetRefinementSessionQuery(sessionId ?? "", {
    skip: !sessionId,
    pollingInterval: sessionId ? POLL_INTERVAL_MS : 0,
  });

  // Stop polling once the session is no longer active.
  useEffect(() => {
    if (!session) return;
    if (session.status !== "active") {
      // No-op: RTK Query will continue at its interval; the polling
      // behaviour is acceptable post-completion since the data is
      // stable.
    }
  }, [session]);

  function handleSessionStarted(id: string) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_SESSION_KEY, id);
    }
    setSessionId(id);
  }

  function handleStartNew() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
    setSessionId(null);
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <header>
        <div className="flex items-center gap-2">
          <Sparkles className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold">Resume refinement</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Iterate on your resume one bullet at a time. AI suggests, you accept
          or override, and at the end you download a polished PDF or DOCX.
        </p>
      </header>

      {sessionId && error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          We couldn't load that session.{" "}
          <button
            type="button"
            onClick={handleStartNew}
            className="underline"
          >
            Start a new one
          </button>
          .
        </div>
      )}

      {!sessionId && <SessionStartPanel onSessionStarted={handleSessionStarted} />}

      {sessionId && isLoading && !session && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {session && (
        <div className="space-y-4">
          {session.status === "active" && (
            <PendingProposalCard session={session} />
          )}
          <CompletePanel session={session} />
          <CurrentDraftPanel markdown={session.current_draft} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleStartNew}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Start a different session
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
