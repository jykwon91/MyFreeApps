import { useEffect, useState } from "react";

/** Async so a browser that throws instead of rejecting (or has no permissions API) fails the same way. */
async function queryMicrophone(): Promise<PermissionStatus> {
  return navigator.permissions.query({ name: "microphone" as PermissionName });
}

/**
 * While the microphone is blocked, watches the browser's permission and calls ``onChange`` when it
 * stops being blocked, so allowing it in the site settings needs no reload (the phone rechecks on
 * resume). Returns whether the browser can report that; some (older Firefox and Safari) can't query
 * the microphone, and there the learner still has to reload.
 */
export function useMicrophonePermission(blocked: boolean, onChange: () => void): boolean {
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!blocked) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const handleChange = () => {
      if (status && status.state !== "denied") onChange();
    };
    queryMicrophone()
      .then((result) => {
        if (cancelled) return;
        status = result;
        result.addEventListener("change", handleChange);
        setWatching(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      status?.removeEventListener("change", handleChange);
      setWatching(false);
    };
  }, [blocked, onChange]);

  return blocked && watching;
}
