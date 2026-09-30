/**
 * Picks the best installed text-to-speech voice for a BCP-47 locale.
 *
 * Preference: exact locale (es-MX) > same language (any es-*) ; within each,
 * a local (on-device) voice first -- it starts speaking sooner. Returns null
 * when no voice speaks the language (the caller still speaks with the
 * browser default, tagged with the locale).
 */
export interface VoiceLike {
  lang: string;
  localService: boolean;
  default: boolean;
  name: string;
}

function normalise(lang: string): string {
  return lang.replace("_", "-").toLowerCase();
}

function rank(voice: VoiceLike, locale: string, language: string): number {
  const lang = normalise(voice.lang);
  let score = 0;
  if (lang === locale) score += 4;
  else if (lang.split("-")[0] === language) score += 2;
  else return -1;
  if (voice.localService) score += 1;
  return score;
}

export function voiceForLocale<V extends VoiceLike>(voices: readonly V[], locale: string): V | null {
  const wanted = normalise(locale);
  const language = wanted.split("-")[0];
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
