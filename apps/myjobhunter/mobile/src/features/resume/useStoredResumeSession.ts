import { useEffect, useState } from "react";
import { readResumeSessionId, writeResumeSessionId } from "../../lib/resumeSessionStore";
import type { StoredResumeSession } from "../../types/StoredResumeSession";

/** The session to reopen, as the website keeps it in the browser: kept on start, forgotten on Start a different session. */
export function useStoredResumeSession(): StoredResumeSession {
  const [isReading, setIsReading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let isLive = true;
    void readResumeSessionId().then((id) => {
      if (!isLive) return;
      setSessionId(id);
      setIsReading(false);
    });
    return () => {
      isLive = false;
    };
  }, []);

  return {
    isReading,
    sessionId,
    remember: (id) => {
      setSessionId(id);
      void writeResumeSessionId(id);
    },
    forget: () => {
      setSessionId(null);
      void writeResumeSessionId(null);
    },
  };
}
