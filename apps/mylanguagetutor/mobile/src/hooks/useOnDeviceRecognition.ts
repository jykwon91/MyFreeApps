import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import type { OnDeviceAnswer } from "../types/OnDeviceAnswer";
import { hasInstalledLocale } from "../utils/hasInstalledLocale";

/**
 * Whether the phone can recognize `locale` on the device, so the audio never leaves it; null while
 * Android is asked, again for each new locale. Android (13 and later) lists the languages its on-device
 * recognizer has installed. iOS can't say for a given language (it applies on-device recognition itself
 * where it has it), so it counts as not, and the learner is told the audio may go to Apple. If Android
 * can't list them, not either.
 */
export function useOnDeviceRecognition(locale: string): boolean | null {
  const [answer, setAnswer] = useState<OnDeviceAnswer | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let current = true;
    const check = async () => {
      if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return false;
      const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
      return hasInstalledLocale(installedLocales, locale);
    };
    void check()
      .catch((error: unknown) => {
        console.warn("Couldn't tell whether the phone recognizes speech on the device", error);
        return false;
      })
      .then((onDevice) => {
        if (current) setAnswer({ locale, onDevice });
      });
    return () => {
      current = false;
    };
  }, [locale]);

  if (Platform.OS !== "android") return false;
  return answer?.locale === locale ? answer.onDevice : null;
}
