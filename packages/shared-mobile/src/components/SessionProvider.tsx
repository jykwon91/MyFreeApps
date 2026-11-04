import { type ReactNode, useEffect } from "react";
import { AppState } from "react-native";
import { SessionContext } from "../auth/SessionContext";
import type { MobileSession } from "../types/MobileSession";

export default function SessionProvider({ session, children }: { session: MobileSession; children: ReactNode }) {
  useEffect(() => {
    void session.start();
    // A phone that was locked at launch can read the session once it's opened.
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active" && session.getState().status === "unreadable") {
        void session.retryRestore();
      }
    });
    return () => subscription.remove();
  }, [session]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
