import * as SecureStore from "expo-secure-store";
import { DASHBOARD_FOLDS_KEY, DEFAULT_DASHBOARD_LAYOUT } from "../constants/dashboard";
import type { DashboardLayout } from "../types/DashboardLayout";
import type { StoredDashboardFolds } from "../types/StoredDashboardFolds";
import { parseDashboardFolds } from "./parseDashboardFolds";

/**
 * The folds the person left the board with. A fold is only a preference, so if the phone
 * won't give it up, or never kept one, the board opens the website's way.
 */
export async function readDashboardFolds(): Promise<DashboardLayout> {
  try {
    const raw = await SecureStore.getItemAsync(DASHBOARD_FOLDS_KEY);
    return (raw === null ? null : parseDashboardFolds(raw)) ?? DEFAULT_DASHBOARD_LAYOUT;
  } catch (error) {
    console.warn("Couldn't read the board's folds; opening it unfolded", error);
    return DEFAULT_DASHBOARD_LAYOUT;
  }
}

/** Keeps the folds for next time. Failing only loses that, so it's logged rather than shown. */
export async function writeDashboardFolds(layout: DashboardLayout): Promise<void> {
  const stored: StoredDashboardFolds = { collapsedLanes: [...layout.collapsedLanes], isClosedOpen: layout.isClosedOpen };
  try {
    await SecureStore.setItemAsync(DASHBOARD_FOLDS_KEY, JSON.stringify(stored));
  } catch (error) {
    console.warn("Couldn't keep the board's folds for next time", error);
  }
}
