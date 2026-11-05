import { getStringAsync, setStringAsync } from "expo-clipboard";
import { Platform } from "react-native";
import { CLIPBOARD_CLEAR_MS } from "../constants/twoStep";

let pendingClear: ReturnType<typeof setTimeout> | null = null;

/**
 * iOS removes it by itself, even in the background, and reading it back would show a paste prompt.
 * Android has no expiry, so a timer tries, and leaves alone anything copied since. That timer is
 * best effort: the phone can stop it while the app is in the background.
 */
export async function copySecret(value: string): Promise<void> {
  await setStringAsync(value, {
    ios: { localOnly: true, expiresAt: new Date(Date.now() + CLIPBOARD_CLEAR_MS) },
    android: { isSensitive: true },
  });
  if (Platform.OS === "ios") return;
  if (pendingClear) clearTimeout(pendingClear);
  pendingClear = setTimeout(() => {
    pendingClear = null;
    void getStringAsync()
      .then((current) => (current === value ? setStringAsync("") : undefined))
      .catch(() => undefined);
  }, CLIPBOARD_CLEAR_MS);
}
