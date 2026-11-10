import { STORED_SESSION_KEY, type StoredSession } from "@platform/mobile/test-support/storedSession";
import { INSTALLED_AT } from "./fakeApplication";
import { storedItems } from "./memorySecureStore";
import type { FakeTokens } from "./types/FakeTokens";

export const ACCOUNT_EMAIL = "me@example.com";

/** A phone that signed in before the app was last closed. */
export function storeSession(): void {
  const stored: StoredSession = {
    refreshToken: "r0",
    sessionId: "s0",
    email: ACCOUNT_EMAIL,
    installedAt: INSTALLED_AT.toISOString(),
  };
  storedItems.set(STORED_SESSION_KEY, JSON.stringify(stored));
}

export function storedSession(): StoredSession | null {
  const raw = storedItems.get(STORED_SESSION_KEY);
  return raw === undefined ? null : (JSON.parse(raw) as StoredSession);
}

export function tokens(n: number): FakeTokens {
  return { access_token: `a${n}`, refresh_token: `r${n}`, session_id: `s${n}` };
}
