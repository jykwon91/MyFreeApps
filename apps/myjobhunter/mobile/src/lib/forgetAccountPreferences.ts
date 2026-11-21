import * as SecureStore from "expo-secure-store";
import { ACCOUNT_PREFERENCE_KEYS } from "../constants/accountPreferences";

/**
 * Forgets the dismissed reminders and folded board lanes the phone kept for the account that left,
 * so the next one sees them as a new account would. Failing only leaves them behind, so it never
 * throws and the rest of the sign-out still runs.
 */
export async function forgetAccountPreferences(): Promise<void> {
  try {
    await Promise.all(ACCOUNT_PREFERENCE_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
  } catch (error) {
    console.warn("Couldn't forget the previous account's dismissed reminders and folded lanes", error);
  }
}
