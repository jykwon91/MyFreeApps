import { primaryLanguage } from "./primaryLanguage";
import type { VoiceLike } from "../types/speech/voice-like";

/**
 * Picks the best installed text-to-speech voice for a BCP-47 locale.
 *
 * Preference: exact locale (es-MX) > same language (any es-*) ; within each,
 * an enhanced voice first (it sounds more natural), then a local (on-device)
 * one -- it starts speaking sooner. The browser never says ``enhanced``, so
 * its ranking is locale, then local. Returns null
 * when no voice speaks the language (the caller still speaks with the
 * platform's default voice, tagged with the locale).
 */

function normalise(lang: string): string {
  return lang.replace("_", "-").toLowerCase();
}

function rank(voice: VoiceLike, locale: string, language: string): number {
  const lang = normalise(voice.lang);
  let score = 0;
  if (lang === locale) score += 8;
  else if (primaryLanguage(lang) === language) score += 4;
  else return -1;
  if (voice.enhanced) score += 2;
  if (voice.localService) score += 1;
  return score;
}

export function voiceForLocale<V extends VoiceLike>(voices: readonly V[], locale: string): V | null {
  const wanted = normalise(locale);
  const language = primaryLanguage(wanted);
  let best: V | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = rank(voice, wanted, language);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}
