import { useSyncExternalStore } from "react";
import { isDemoWelcomeDismissed, subscribeToDemoWelcome } from "./demoWelcome";

export function useDemoWelcomeDismissed(): boolean {
  return useSyncExternalStore(subscribeToDemoWelcome, isDemoWelcomeDismissed);
}
