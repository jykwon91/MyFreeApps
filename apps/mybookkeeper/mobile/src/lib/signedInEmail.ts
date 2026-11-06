import { session } from "./session";

export function signedInEmail(): string | null {
  const state = session.getState();
  return state.status === "signedIn" ? state.email : null;
}
