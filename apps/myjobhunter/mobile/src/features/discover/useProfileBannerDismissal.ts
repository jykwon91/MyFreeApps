import { useEffect, useState } from "react";
import { readProfileBannerDismissed, writeProfileBannerDismissed } from "../../lib/profileBannerPrefs";
import type { ProfileBannerDismissal } from "../../types/ProfileBannerDismissal";

/** Whether the profile reminder was dismissed, kept on the phone as the website keeps it in the browser. */
export function useProfileBannerDismissal(): ProfileBannerDismissal {
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void readProfileBannerDismissed().then((stored) => {
      // A dismissal made while this was being read wins.
      if (isCurrent) setIsDismissed((current) => current ?? stored);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return {
    isDismissed,
    dismiss: () => {
      setIsDismissed(true);
      void writeProfileBannerDismissed();
    },
  };
}
