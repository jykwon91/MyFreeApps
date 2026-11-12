import { voiceForLocale } from "@mylanguagetutor/api-client/utils/voiceForLocale";
import { VoiceQuality, type Voice } from "expo-speech";
import { ANDROID_LOCAL_VOICE_MARK, ANDROID_NETWORK_VOICE_MARK, IOS_PREMIUM_VOICE_MARK, NOVELTY_VOICE_PREFIXES } from "../constants/speech";

/** A voice worth teaching with: not one of iOS's novelty voices, and not one Android streams from the network. */
function isSuitable(voice: Voice): boolean {
  if (NOVELTY_VOICE_PREFIXES.some((prefix) => voice.identifier.startsWith(prefix))) return false;
  return !voice.identifier.includes(ANDROID_NETWORK_VOICE_MARK);
}

/**
 * The phone's best voice for a locale, ranked as the website ranks its voices (exact locale, then
 * the same language), using what the phone says about each: enhanced or premium quality first,
 * then, on Android, one that runs on the device. Undefined when no suitable voice speaks the language: the phone then
 * picks one from the language.
 */
export function voiceIdForLocale(voices: readonly Voice[], locale: string): string | undefined {
  const choices = voices.filter(isSuitable).map((voice) => ({
    identifier: voice.identifier,
    lang: voice.language,
    enhanced: voice.quality === VoiceQuality.Enhanced || voice.identifier.includes(IOS_PREMIUM_VOICE_MARK),
    localService: voice.identifier.includes(ANDROID_LOCAL_VOICE_MARK),
  }));
  return voiceForLocale(choices, locale)?.identifier;
}
