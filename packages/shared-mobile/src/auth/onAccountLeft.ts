import type { MobileSession } from "../types/MobileSession";

/**
 * Calls `listener` when someone signs out or a different account signs in. A session the
 * server ended doesn't count until then: signing back in as the same person keeps
 * what they were doing.
 */
export function onAccountLeft(session: MobileSession, listener: () => void): () => void {
  let last: string | null = null;
  return session.subscribe(() => {
    const state = session.getState();
    if (state.status === "signedIn") {
      if (last !== null && last !== state.email) listener();
      last = state.email;
    } else if (state.status === "signedOut" && !state.endedByServer && last !== null) {
      last = null;
      listener();
    }
  });
}
