import { useState } from "react";
import NoSessionView from "@/features/resume_refinement/NoSessionView";
import SessionLoadErrorView from "@/features/resume_refinement/SessionLoadErrorView";
import SessionLoadingView from "@/features/resume_refinement/SessionLoadingView";
import ActiveSessionView from "@/features/resume_refinement/ActiveSessionView";
import { useGetRefinementSessionQuery } from "@/lib/resumeRefinementApi";

const ACTIVE_SESSION_KEY = "mjh:resumeRefinementSessionId";
const POLL_INTERVAL_MS = 3000;

export default function ResumeRefinement() {
  const [sessionId, setSessionId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_SESSION_KEY) : null,
  );

  // Polling is intentionally not stopped once the session is no
  // longer active — the data is stable post-completion so the cost
  // is one tiny GET every 3s, and stopping introduces a stale-cache
  // edge case if the user returns to a completed session and
  // downloads. During status=preparing the same poll drives the
  // staged progress card and the unlock.
  const {
    data: session,
    isLoading,
    error,
  } = useGetRefinementSessionQuery(sessionId ?? "", {
    skip: !sessionId,
    pollingInterval: sessionId ? POLL_INTERVAL_MS : 0,
  });

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

  return <ActiveSessionView session={session} onStartNew={handleStartNew} />;
}
