import { useCallback, useEffect, useState } from "react";
import { fetchTwoFactorEnabled } from "../auth/mobileAuthApi";

/** `null` until known, because guessing either way would show the wrong form. */
export function useTwoFactorEnabled() {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    fetchTwoFactorEnabled().then(setIsEnabled, () => setHasError(true));
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setIsEnabled(await fetchTwoFactorEnabled());
      setHasError(false);
    } catch {
      setHasError(true);
    }
  }, []);

  return { isEnabled, hasError, reload };
}
