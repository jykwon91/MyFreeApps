import type { DeviceSignOutOutcome } from "./device-sign-out-outcome";
import type { SignedInDevice } from "./signed-in-device";

export interface UseDevicesResult {
  /** Null until the first list arrives. */
  devices: SignedInDevice[] | null;
  /** The last load failed. A list loaded before that stays in `devices`. */
  hasError: boolean;
  reload: () => Promise<void>;
  signOutDevice: (id: string) => Promise<DeviceSignOutOutcome>;
}
