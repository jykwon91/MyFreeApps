import type { SignedInDevice } from "../types/security/signed-in-device";

/** The current device first when there is one (a phone's own session), then the rest by how recently they were used. */
export function devicesInDisplayOrder(devices: SignedInDevice[], thisSessionId: string | null): SignedInDevice[] {
  return [...devices].sort((a, b) => {
    if (a.id === thisSessionId) return -1;
    if (b.id === thisSessionId) return 1;
    return b.last_used_at.localeCompare(a.last_used_at);
  });
}
