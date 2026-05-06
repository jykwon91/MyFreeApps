import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Skeleton } from "@platform/ui";
import SessionStartPanel from "@/features/resume_refinement/SessionStartPanel";
import CurrentDraftPanel from "@/features/resume_refinement/CurrentDraftPanel";
import PendingProposalCard from "@/features/resume_refinement/PendingProposalCard";
import CompletePanel from "@/features/resume_refinement/CompletePanel";
import ActiveSessionLayout from "@/features/resume_refinement/ActiveSessionLayout";
import { useGetRefinementSessionQuery } from "@/lib/resumeRefinementApi";
import type { RefinementSession } from "@/types/resume-refinement/refinement-session";

const ACTIVE_SESSION_KEY = "mjh:resumeRefinementSessionId";
const POLL_INTERVAL_MS = 3000;

export default function ResumeRefinement() {
  const [sessionId, setSessionId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_SESSION_KEY) : null,
  );

  const {
    data: session,
    isLoading,
    error,
  } = useGetRefinementSessionQuery(sessionId ?? "", {
    skip: !sessionId,
    pollingInterval: sessionId ? POLL_INTERVAL_MS : 0,
  });

  // Polling is intentionally not stopped once the session is no
  // longer active — the data is stable post-completion so the cost
  // is one tiny GET every 3s, and stopping introduces a stale-cache
  // edge case if the user returns to a completed session and
  // downloads.
  useEffect(() => {
    if (!session) return;
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

  if (!sessionId) {
    return <NoSessionView onSessionStarted={handleSessionStarted} />;
  }

  if (error) {
    return <SessionLoadErrorView onStartNew={handleStartNew} />;
  }

  if (isLoading || !session) {
    return <SessionLoadingView />;
  }

  return (
    <ActiveSessionView session={session} onStartNew={handleStartNew} />
  );
}

interface NoSessionViewProps {
  onSessionStarted: (id: string) => void;
}

function NoSessionView({ onSessionStarted }: NoSessionViewProps) {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <ResumeRefinementHeader />
      <SessionStartPanel onSessionStarted={onSessionStarted} />
    </main>
  );
}

interface SessionLoadErrorViewProps {
  onStartNew: () => void;
}

function SessionLoadErrorView({ onStartNew }: SessionLoadErrorViewProps) {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <ResumeRefinementHeader />
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        We couldn't load that session.{" "}
        <button type="button" onClick={onStartNew} className="underline">
          Start a new one
        </button>
        .
      </div>
    </main>
  );
}

function SessionLoadingView() {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <ResumeRefinementHeader />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}

interface ActiveSessionViewProps {
  session: RefinementSession;
  onStartNew: () => void;
}

function ActiveSessionView({ session, onStartNew }: ActiveSessionViewProps) {
  const activeTarget =
    session.improvement_targets &&
    session.target_index < session.improvement_targets.length
      ? session.improvement_targets[session.target_index]
      : null;
  const highlightText = activeTarget?.current_text ?? null;

  const draft = (
    <CurrentDraftPanel
      markdown={session.current_draft}
      highlightText={highlightText}
    />
  );

  const controls = (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="overflow-y-auto min-h-0 space-y-4 pr-1">
        {session.status === "active" && (
          <PendingProposalCard session={session} />
        )}
        <CompletePanel session={session} />
      </div>
      <div className="flex justify-end shrink-0">
        <button
          type="button"
          onClick={onStartNew}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          Start a different session
        </button>
      </div>
    </div>
  );

  return (
    <ActiveSessionLayout
      header={<ResumeRefinementHeader compact />}
      draft={draft}
      controls={controls}
    />
  );
}

interface ResumeRefinementHeaderProps {
  compact?: boolean;
}

function ResumeRefinementHeader({ compact = false }: ResumeRefinementHeaderProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">Resume refinement</h1>
      </div>
    );
  }
  return (
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
  );
}
