import {
  ACCOUNT_PREFERENCE_STORAGE_KEYS,
  KANBAN_LANE_STORAGE_PREFIX,
} from "@/constants/account-preference-storage";

/**
 * Forgets the dismissed reminders and folded board lanes this browser kept for the account that
 * left, so the next one sees them as a new account would. Failing only leaves them behind, so it
 * never throws and the rest of the sign-out still runs.
 */
export function forgetAccountPreferences(): void {
  try {
    const laneKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(KANBAN_LANE_STORAGE_PREFIX)) laneKeys.push(key);
    }
    [...ACCOUNT_PREFERENCE_STORAGE_KEYS, ...laneKeys].forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("Couldn't forget the previous account's dismissed reminders and folded lanes", error);
  }
}
