import { useCallback, useState } from "react";
import { isAxiosError } from "axios";
import { fetchDevices, revokeDevice } from "../auth/deviceSessions";
import type { DeviceSignOutOutcome } from "../types/security/device-sign-out-outcome";
import type { SignedInDevice } from "../types/security/signed-in-device";
import type { UseDevicesResult } from "../types/security/use-devices-result";
import { axiosWriteOutcome } from "../utils/axiosWriteOutcome";

/** The account's signed-in phones and tablets. Loads nothing until `reload` is called. */
export function useDevices(): UseDevicesResult {
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setDevices(await fetchDevices());
      setHasError(false);
    } catch {
      setHasError(true);
    }
  }, []);

  /**
   * Resolves once the device is gone, including when it already was. A lost answer or a proxy error can come after the
   * server signed it out (see writeOutcome), so the list is read again: off the list means it went, still on it rejects
   * with the original error, and a list that won't load resolves "unsure". Any other failure rejects.
   */
  const signOutDevice = useCallback(async (id: string): Promise<DeviceSignOutOutcome> => {
    let outcome: DeviceSignOutOutcome = "signedOut";
    try {
      await revokeDevice(id);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        outcome = "alreadyGone";
      } else if (axiosWriteOutcome(error) === "unknown") {
        let latest: SignedInDevice[];
        try {
          latest = await fetchDevices();
        } catch {
          return "unsure";
        }
        setDevices(latest);
        if (latest.some((device) => device.id === id)) throw error;
        return "signedOut";
      } else {
        throw error;
      }
    }
    setDevices((current) => current?.filter((device) => device.id !== id) ?? null);
    return outcome;
  }, []);

  return { devices, hasError, reload, signOutDevice };
}
