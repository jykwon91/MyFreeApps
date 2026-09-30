import { describe, expect, it } from "vitest";
import { voiceForLocale, type VoiceLike } from "@/features/speech/voiceForLocale";

function voice(name: string, lang: string, localService = false): VoiceLike {
  return { name, lang, localService, default: false };
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
});
