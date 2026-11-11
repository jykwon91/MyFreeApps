import * as SecureStore from "expo-secure-store";
import { PROFILE_BANNER_DISMISSED_KEY } from "../constants/profileBanner";

/** Whether the profile reminder was dismissed before. If the phone won't say, it shows again. */
export async function readProfileBannerDismissed(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PROFILE_BANNER_DISMISSED_KEY)) === "true";
  } catch (error) {
    console.warn("Couldn't read whether the profile reminder was dismissed; showing it", error);
    return false;
  }
}

/** Keeps the dismissal for next time. Failing only means the reminder comes back, so it's logged rather than shown. */
export async function writeProfileBannerDismissed(): Promise<void> {
  try {
    await SecureStore.setItemAsync(PROFILE_BANNER_DISMISSED_KEY, "true");
  } catch (error) {
    console.warn("Couldn't keep the profile reminder's dismissal for next time", error);
  }
}
