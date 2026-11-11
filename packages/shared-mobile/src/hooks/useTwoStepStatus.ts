import { isAxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTwoFactorEnabled } from "../auth/mobileAuthApi";
import type { TwoStepStatus } from "../types/TwoStepStatus";
import type { TwoStepStatusFailure } from "../types/TwoStepStatusFailure";

/** `enabled` stays as last read when a reload fails, so a failure never reads as "off". */
export function useTwoStepStatus(reloadSignal = 0): TwoStepStatus {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<TwoStepStatusFailure | null>(null);
  const [successfulReads, setSuccessfulReads] = useState(0);
  const latestRead = useRef(0);

  const reload = useCallback((): Promise<void> => {
    latestRead.current += 1;
    const thisRead = latestRead.current;
    return fetchTwoFactorEnabled().then(
      (isEnabled) => {
        if (thisRead !== latestRead.current) return;
        setEnabled(isEnabled);
        setFailure(null);
        setSuccessfulReads((reads) => reads + 1);
      },
      (error: unknown) => {
        if (thisRead !== latestRead.current) return;
        setFailure(isAxiosError(error) && (error.response?.status ?? 0) >= 500 ? "server" : "connection");
      },
    );
  }, []);

  const markEnabled = useCallback((isEnabled: boolean): void => {
    latestRead.current += 1;
    setEnabled(isEnabled);
    setFailure(null);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  return { enabled, failure, successfulReads, reload, markEnabled };
}
