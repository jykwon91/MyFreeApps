import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { isoFromDate } from "./localDate";

function subscribe(onChange: () => void): () => void {
  const subscription = AppState.addEventListener("change", onChange);
  return () => subscription.remove();
}

function todayIso(): string {
  return isoFromDate(new Date());
}

/** Today's date, kept right when the app comes back after being left open overnight. */
export function useTodayIso(): string {
  return useSyncExternalStore(subscribe, todayIso);
}
