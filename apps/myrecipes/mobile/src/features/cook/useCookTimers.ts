import { useEffect, useMemo } from "react";
import { AppState } from "react-native";
import { useSelector, useStore } from "react-redux";
import type { AppStore, RootState } from "../../lib/store";
import {
  cancelCookTimerAlert,
  requestExactCookTimerAlerts,
  restorableCookTimers,
  scheduleCookTimerAlert,
} from "../../services/cookTimerNotifications";
import type { CookTimer } from "../../types/CookTimer";
import { timerAlertSet, timerRemoved, timerStarted, timersRestored } from "./cookTimersSlice";

async function setAlert(store: AppStore, timer: CookTimer, mayAsk: boolean): Promise<void> {
  const alert = await scheduleCookTimerAlert(timer, mayAsk).catch(() => "failed" as const);
  store.dispatch(timerAlertSet({ id: timer.id, endsAt: timer.endsAt, alert }));
  // Cancelled while this was waiting on a prompt: don't leave its alert behind. A timer with the
  // same id that's since restarted owns that alert now.
  const isGone = !store.getState().cookTimers.items.some((item) => item.id === timer.id);
  if (isGone && alert !== "off" && alert !== "failed") await cancelCookTimerAlert(timer.id);
}

/** Brings running timers' alerts in line with what's allowed now, which can change outside the app. */
async function refreshAlerts(store: AppStore, onlyIf: (timer: CookTimer) => boolean = () => true): Promise<void> {
  const running = store
    .getState()
    .cookTimers.items.filter((timer) => timer.alert !== "pending" && timer.endsAt > Date.now() && onlyIf(timer));
  await Promise.all(running.map((timer) => setAlert(store, timer, false)));
}

export function useCookTimers(recipeId: string) {
  const store = useStore<RootState>() as AppStore;
  const allTimers = useSelector((state: RootState) => state.cookTimers.items);
  const timers = useMemo(
    () => allTimers.filter((timer) => timer.recipeId === recipeId).sort((a, b) => a.endsAt - b.endsAt),
    [allTimers, recipeId],
  );

  useEffect(() => {
    restorableCookTimers()
      .then((restorable) => {
        store.dispatch(timersRestored(restorable));
        return refreshAlerts(store);
      })
      .catch(() => {
        // Nothing to restore; a timer started from here still works.
      });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshAlerts(store);
    });
    return () => subscription.remove();
  }, [store]);

  async function start(details: Omit<CookTimer, "endsAt" | "alert">): Promise<void> {
    const mayAsk = !store.getState().cookTimers.hasAskedForAlerts;
    const timer: CookTimer = { ...details, alert: "pending", endsAt: Date.now() + details.seconds * 1000 };
    store.dispatch(timerStarted(timer));
    await setAlert(store, timer, mayAsk);
    // Another timer started while the prompt was coming up was told notifications were off.
    if (mayAsk) await refreshAlerts(store, (other) => other.alert === "off");
  }

  async function allowExactAlerts(): Promise<void> {
    const isAllowed = await requestExactCookTimerAlerts().catch(() => false);
    if (isAllowed) await refreshAlerts(store);
  }

  function remove(timerId: string): void {
    store.dispatch(timerRemoved(timerId));
    void cancelCookTimerAlert(timerId);
  }

  return { allowExactAlerts, remove, start, timers };
}
