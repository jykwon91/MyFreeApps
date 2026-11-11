import { useEffect, useState } from "react";
import { readDismissed, writeDismissed } from "../lib/dismissalPrefs";
import type { Dismissal } from "../types/Dismissal";

/** Whether the banner kept under `key` was dismissed, kept on the phone as the website keeps it in the browser. */
export function useDismissal(key: string): Dismissal {
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void readDismissed(key).then((stored) => {
      // A dismissal made while this was being read wins.
      if (isCurrent) setIsDismissed((current) => current ?? stored);
    });
    return () => {
      isCurrent = false;
    };
  }, [key]);

  return {
    isDismissed,
    dismiss: () => {
      setIsDismissed(true);
      void writeDismissed(key);
    },
  };
}
