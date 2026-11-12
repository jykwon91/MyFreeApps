import * as SecureStore from "expo-secure-store";

/** Whether a banner was dismissed before. If the phone won't say, it shows again. */
export async function readDismissed(key: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(key)) === "true";
  } catch (error) {
    console.warn(`Couldn't read whether ${key} was dismissed; showing it`, error);
    return false;
  }
}

/** Keeps the dismissal for next time. Failing only means the banner comes back, so it's logged rather than shown. */
export async function writeDismissed(key: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, "true");
  } catch (error) {
    console.warn(`Couldn't keep the dismissal of ${key} for next time`, error);
  }
}
