import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

/** Who this is, `null` if nobody, `undefined` while it isn't known yet. */
function accountOf(state: SessionState): string | null | undefined {
  if (state.status === "signedIn") return state.email;
  return state.status === "signedOut" ? null : undefined;
}

/** Cached responses belong to one account, so they go when the account does. */
export function resetCacheOnAccountChange(session: MobileSession, resetCache: () => void): () => void {
  let previous = accountOf(session.getState());
  return session.subscribe(() => {
    const current = accountOf(session.getState());
    const changed = previous !== undefined && current !== undefined && previous !== current;
    const leftAccount = typeof previous === "string" && current !== previous;
    previous = current;
    if (changed || leftAccount) resetCache();
  });
}
