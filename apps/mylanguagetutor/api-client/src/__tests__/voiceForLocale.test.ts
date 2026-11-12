import { describe, expect, it } from "vitest";
import { primaryLanguage } from "../utils/primaryLanguage";
import { voiceForLocale } from "../utils/voiceForLocale";
import type { NamedVoice } from "./support/namedVoice";

function voice(name: string, lang: string, localService = false): NamedVoice {
  return { name, lang, localService };
}

describe("voiceForLocale", () => {
  it("prefers the exact locale over the same language", () => {
    const voices = [voice("Spain", "es-ES", true), voice("Mexico", "es-MX")];
    expect(voiceForLocale(voices, "es-MX")?.name).toBe("Mexico");
  });

  it("prefers a local voice within the same rank", () => {
    const voices = [voice("Remote", "es-MX"), voice("Local", "es-MX", true)];
    expect(voiceForLocale(voices, "es-MX")?.name).toBe("Local");
  });

  it("falls back to the same language", () => {
    const voices = [voice("English", "en-US", true), voice("Spain", "es_ES")];
    expect(voiceForLocale(voices, "es-MX")?.name).toBe("Spain");
  });

  it("returns null when nothing speaks the language", () => {
    expect(voiceForLocale([voice("English", "en-US")], "es-MX")).toBeNull();
  });

  it("ranks voices that don't say where they run by locale alone, first one first", () => {
    const voices: NamedVoice[] = [
      { name: "Spain", lang: "es-ES" },
      { name: "Mexico 1", lang: "es-MX" },
      { name: "Mexico 2", lang: "es-MX" },
    ];
    expect(voiceForLocale(voices, "es-MX")?.name).toBe("Mexico 1");
  });
});

describe("voiceForLocale with an enhanced hint (the phone)", () => {
  it("prefers an enhanced voice within the same locale", () => {
    const voices: NamedVoice[] = [
      { name: "Compact", lang: "es-MX" },
      { name: "Enhanced", lang: "es-MX", enhanced: true },
    ];
    expect(voiceForLocale(voices, "es-MX")?.name).toBe("Enhanced");
  });

  it("prefers enhanced over local, and either over neither", () => {
    const voices: NamedVoice[] = [
      { name: "Plain", lang: "es-MX" },
      { name: "Local", lang: "es-MX", localService: true },
      { name: "Enhanced", lang: "es-MX", enhanced: true },
    ];
    expect(voiceForLocale(voices, "es-MX")?.name).toBe("Enhanced");
    expect(voiceForLocale(voices.slice(0, 2), "es-MX")?.name).toBe("Local");
  });

  it("still puts the exact locale above an enhanced, local voice of the same language", () => {
    const voices: NamedVoice[] = [
      { name: "Spain", lang: "es-ES", enhanced: true, localService: true },
      { name: "Mexico", lang: "es-MX" },
    ];
    expect(voiceForLocale(voices, "es-MX")?.name).toBe("Mexico");
  });
});

describe("voiceForLocale for the browser, which never says enhanced", () => {
  // The ranking before the enhanced hint existed: exact locale 4, same language 2, local 1.
  function before(voice: NamedVoice, locale: string): number {
    const lang = voice.lang.replace("_", "-").toLowerCase();
    if (lang === locale.toLowerCase()) return 4 + (voice.localService ? 1 : 0);
    if (lang.split("-")[0] === locale.toLowerCase().split("-")[0]) return 2 + (voice.localService ? 1 : 0);
    return -1;
  }

  it("picks what it picked before, for every pair of voices", () => {
    const kinds: NamedVoice[] = [];
    for (const lang of ["es-MX", "es-ES", "en-US"]) {
      for (const localService of [false, true]) kinds.push({ name: `${lang} ${localService}`, lang, localService });
    }
    for (const first of kinds) {
      for (const second of kinds) {
        const pair = [first, second];
        const scores = pair.map((voice) => before(voice, "es-MX"));
        const best = Math.max(...scores);
        const expected = best < 0 ? null : pair[scores.indexOf(best)];
        expect(voiceForLocale(pair, "es-MX")).toBe(expected);
      }
    }
  });
});

describe("primaryLanguage", () => {
  it("is the language alone, whatever the separator or case", () => {
    expect(primaryLanguage("es-MX")).toBe("es");
    expect(primaryLanguage("ES_mx")).toBe("es");
    expect(primaryLanguage("es")).toBe("es");
  });
});
