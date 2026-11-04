import { useContext, useSyncExternalStore } from "react";
import { SessionContext } from "../auth/SessionContext";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

export function useSession(): { session: MobileSession; state: SessionState } {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider above it.");
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  return { session, state };
}
