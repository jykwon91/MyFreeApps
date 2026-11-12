import { tokenIdentity } from "@platform/ui";
import {
  ACTIVE_ORG_OWNER_STORAGE_KEY,
  ACTIVE_ORG_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
} from "./session-storage-keys";

// The stored organization choice is shared by every tab and outlives a session, so it
// is written with the user it belongs to. That is what lets a different user be told
// apart after a reload, when the in-memory "last signed in" is gone. Storage can be
// blocked, so every access goes through these three and a failure reads as "nothing".

function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
}

function currentUser(): string | null {
  return tokenIdentity(readItem(TOKEN_STORAGE_KEY));
}

export function readActiveOrgId(): string | null {
  return readItem(ACTIVE_ORG_STORAGE_KEY);
}

/** Store the choice for whoever is signed in; null forgets it. */
export function persistActiveOrgId(orgId: string | null): void {
  if (!orgId) {
    forgetActiveOrgId();
    return;
  }
  writeItem(ACTIVE_ORG_STORAGE_KEY, orgId);
  const user = currentUser();
  if (user) writeItem(ACTIVE_ORG_OWNER_STORAGE_KEY, user);
  else removeItem(ACTIVE_ORG_OWNER_STORAGE_KEY);
}

export function forgetActiveOrgId(): void {
  removeItem(ACTIVE_ORG_STORAGE_KEY);
  removeItem(ACTIVE_ORG_OWNER_STORAGE_KEY);
}

/** Whether a stored choice exists that the signed-in user did not make (or no one is signed in). */
export function hasOtherUsersOrgId(): boolean {
  if (readActiveOrgId() === null) return false;
  return readItem(ACTIVE_ORG_OWNER_STORAGE_KEY) !== currentUser();
}

/** Forget the stored choice if a signed-in user did not make it; a signed-out state leaves it. */
export function forgetOtherUsersOrgId(): void {
  if (currentUser() !== null && hasOtherUsersOrgId()) {
    forgetActiveOrgId();
  }
}

/**
 * A choice stored before owners were recorded belongs to whoever is signed in at that
 * point, if anyone is; with no one signed in it can't be attributed and is dropped
 * when the next user signs in.
 */
export function adoptUnownedOrgId(): void {
  const user = currentUser();
  if (user && readActiveOrgId() !== null && readItem(ACTIVE_ORG_OWNER_STORAGE_KEY) === null) {
    writeItem(ACTIVE_ORG_OWNER_STORAGE_KEY, user);
  }
}
