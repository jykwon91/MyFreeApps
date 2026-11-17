import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";
import { deleteLeftoversOwner, readLeftoversOwner, writeLeftoversOwner } from "./sessionStorage";

/**
 * Calls `listener` when someone signs out or a different account signs in. A session the
 * server ended doesn't count until then: signing back in as the same person keeps
 * what they were doing. Who the phone's leftovers belong to is kept on the phone, so
 * this holds across the app being closed in between.
 */
export function onAccountLeft(session: MobileSession, listener: () => void): () => void {
  // Who the leftovers on the phone belong to. Unknown until the phone has been asked.
  let owner: string | null = null;
  let ownerKnown = false;
  // Who has been signed in since the app opened, for telling a sign-out from a first launch.
  let current: string | null = null;
  const early: SessionState[] = [];
  let writes: Promise<unknown> = Promise.resolve();

  function persist(write: () => Promise<void>): void {
    writes = writes.then(write).catch((error: unknown) => {
      console.warn("Couldn't save whose things are on this phone", error);
    });
  }

  function handle(state: SessionState): void {
    if (state.status === "signedIn") {
      if (owner !== null && owner !== state.email) listener();
      current = state.email;
      if (owner !== state.email) persist(() => writeLeftoversOwner(state.email));
      owner = state.email;
    } else if (state.status === "signedOut" && !state.endedByServer && current !== null) {
      current = null;
      owner = null;
      listener();
      persist(deleteLeftoversOwner);
    }
  }

  function known(found: string | null): void {
    owner = found;
    ownerKnown = true;
    early.splice(0).forEach(handle);
  }

  readLeftoversOwner().then(known, (error: unknown) => {
    console.warn("Couldn't tell whose things are on this phone", error);
    known(null);
  });

  return session.subscribe(() => {
    const state = session.getState();
    if (ownerKnown) handle(state);
    else early.push(state);
  });
}
