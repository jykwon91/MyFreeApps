import { primaryLanguage } from "@mylanguagetutor/api-client/utils/primaryLanguage";
import { Platform } from "react-native";

/**
 * The language to tell the phone's text-to-speech. iOS takes the whole locale ("es-MX") and picks a
 * voice from that region. Android takes only a language there ("es"): with a whole locale it falls
 * back to the phone's own language.
 */
export function speechLanguage(locale: string): string {
  return Platform.OS === "android" ? primaryLanguage(locale) : locale;
}
