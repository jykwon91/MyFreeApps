import type { SignedInDevice } from "@platform/core/types/security/signed-in-device";

export interface DeviceSessionsStubOptions {
  apiBase?: string;
  /** The list the server starts with. */
  devices?: SignedInDevice[];
  /** Refuse every sign-out with this status and JSON `detail`, the list left as it was. */
  refuseSignOut?: { status: number; detail: string };
}
