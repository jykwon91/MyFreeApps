import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { STORED_SESSION_KEY } from "../constants/session";
import type { StoredSession } from "../types/StoredSession";

// Readable once the phone has been unlocked after a restart, so background work can use
// it, and never copied to another device through a backup.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function parseStoredSession(raw: string): StoredSession | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { refreshToken, sessionId, email, installedAt } = value as Record<string, unknown>;
    if (typeof refreshToken !== "string" || typeof sessionId !== "string" || typeof email !== "string") {
      return null;
    }
    return { refreshToken, sessionId, email, installedAt: typeof installedAt === "string" ? installedAt : null };
  } catch {
    return null;
  }
}

/** Throws if the phone won't give the value up, which doesn't mean there isn't one. */
export async function readStoredSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(STORED_SESSION_KEY, OPTIONS);
  if (raw === null) return null;
  const session = parseStoredSession(raw);
  if (!session) console.warn("The saved session is damaged, so this phone is signed out.");
  return session;
}

export function writeStoredSession(session: StoredSession): Promise<void> {
  return SecureStore.setItemAsync(STORED_SESSION_KEY, JSON.stringify(session), OPTIONS);
}

export function deleteStoredSession(): Promise<void> {
  return SecureStore.deleteItemAsync(STORED_SESSION_KEY, OPTIONS);
}

export async function currentInstallStamp(): Promise<string | null> {
  try {
    return (await Application.getInstallationTimeAsync()).toISOString();
  } catch {
    return null;
  }
}
