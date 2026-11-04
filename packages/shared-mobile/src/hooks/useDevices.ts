import { useCallback, useState } from "react";
import { isAxiosError } from "axios";
import { fetchDevices, revokeDevice } from "../auth/mobileAuthApi";
import type { SignedInDevice } from "../types/SignedInDevice";

export function useDevices() {
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

  /** Resolves true when the device is gone, including when it already was. */
  const signOutDevice = useCallback(async (id: string): Promise<"signedOut" | "alreadyGone"> => {
    let outcome: "signedOut" | "alreadyGone" = "signedOut";
    try {
      await revokeDevice(id);
    } catch (error) {
      if (!isAxiosError(error) || error.response?.status !== 404) throw error;
      outcome = "alreadyGone";
    }
    setDevices((current) => current?.filter((device) => device.id !== id) ?? null);
    return outcome;
  }, []);

  return { devices, hasError, reload, signOutDevice };
}
