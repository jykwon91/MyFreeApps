import type { MobileSession } from "../types/MobileSession";

/** Whose things on this phone are in view right now, or null when nobody's signed in. */
export function signedInEmail(session: MobileSession): string | null {
  const state = session.getState();
  return state.status === "signedIn" ? state.email : null;
}
