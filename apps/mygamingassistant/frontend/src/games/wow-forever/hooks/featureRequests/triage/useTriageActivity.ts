import { useEffect } from "react";
import { touchTriage } from "@/games/wow-forever/lib/featureRequests/triage/triageKeyStore";

const ACTIVITY_EVENTS = ["pointerdown", "keydown"] as const;

/** A tap or key press while unlocked restarts the 15-minute idle lock. */
export function useTriageActivity(): void {
  useEffect(() => {
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, touchTriage, { passive: true });
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, touchTriage);
    };
  }, []);
}
