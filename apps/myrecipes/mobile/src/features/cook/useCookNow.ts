import { useContext } from "react";
import { CookNowContext } from "./CookNowContext";

/** The time from the cook screen's clock, re-rendering only the caller each tick. */
export function useCookNow(): number {
  const now = useContext(CookNowContext);
  if (now === null) throw new Error("useCookNow must be used inside CookTimerClock");
  return now;
}
