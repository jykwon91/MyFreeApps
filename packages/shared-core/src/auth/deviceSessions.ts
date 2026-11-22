import api from "../lib/api";
import type { SignedInDevice } from "../types/security/signed-in-device";

/** The phones and tablets signed in to this account, from the shared `/auth/mobile` router. */
export async function fetchDevices(): Promise<SignedInDevice[]> {
  const { data } = await api.get<SignedInDevice[]>("/auth/mobile/sessions");
  return data;
}

/** Signs one device out. The server answers 404 for one that's already gone (or isn't this user's). */
export async function revokeDevice(id: string): Promise<void> {
  await api.delete(`/auth/mobile/sessions/${encodeURIComponent(id)}`);
}
