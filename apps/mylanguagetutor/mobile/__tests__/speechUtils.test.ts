import { VoiceQuality } from "expo-speech/build/Speech.types";
import { Platform } from "react-native";
import { speechLanguage } from "../src/utils/speechLanguage";
import { voiceIdForLocale } from "../src/utils/voiceIdForLocale";
import { voice } from "../test-support/fakeSpeech";

describe("voiceIdForLocale", () => {
  it("prefers an enhanced voice for the locale over the default-quality one", () => {
    const compact = voice("com.apple.voice.compact.es-MX.Paulina", "es-MX");
    const enhanced = voice("com.apple.voice.enhanced.es-MX.Paulina", "es-MX", VoiceQuality.Enhanced);
    expect(voiceIdForLocale([compact, enhanced], "es-MX")).toBe(enhanced.identifier);
  });

  it("counts an iOS premium voice as enhanced", () => {
    const compact = voice("com.apple.voice.compact.es-MX.Paulina", "es-MX");
    const premium = voice("com.apple.voice.premium.es-MX.Paulina", "es-MX");
    expect(voiceIdForLocale([compact, premium], "es-MX")).toBe(premium.identifier);
  });

  it("still prefers the exact locale to an enhanced voice from elsewhere", () => {
    const mexico = voice("com.apple.voice.compact.es-MX.Paulina", "es-MX");
    const spain = voice("com.apple.voice.enhanced.es-ES.Monica", "es-ES", VoiceQuality.Enhanced);
    expect(voiceIdForLocale([spain, mexico], "es-MX")).toBe(mexico.identifier);
  });

  it.each(["com.apple.eloquence.es-MX.Eddy", "com.apple.speech.synthesis.voice.Bells"])(
    "never picks iOS's novelty voice %s",
    (identifier) => {
      const compact = voice("com.apple.voice.compact.es-ES.Monica", "es-ES");
      expect(voiceIdForLocale([voice(identifier, "es-MX", VoiceQuality.Enhanced), compact], "es-MX")).toBe(compact.identifier);
    },
  );

  it("prefers an Android voice on the device to the same voice from the network", () => {
    const local = voice("es-us-x-esd-local", "es-US");
    const network = voice("es-us-x-esd-network", "es-US");
    expect(voiceIdForLocale([network, local], "es-US")).toBe(local.identifier);
  });

  it("never picks an Android voice that streams from the network", () => {
    expect(voiceIdForLocale([voice("es-us-x-esd-network", "es-US")], "es-US")).toBeUndefined();
  });

  it("is undefined when no suitable voice speaks the language, so the phone picks one", () => {
    const english = voice("com.apple.voice.compact.en-US.Samantha", "en-US");
    expect(voiceIdForLocale([english, voice("com.apple.eloquence.es-MX.Flo", "es-MX")], "es-MX")).toBeUndefined();
    expect(voiceIdForLocale([], "es-MX")).toBeUndefined();
  });
});

describe("speechLanguage", () => {
  afterEach(() => jest.restoreAllMocks());

  it("gives iOS the whole locale", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    expect(speechLanguage("es-MX")).toBe("es-MX");
  });

  it("gives Android only the language, which it reads as a language rather than falling back to the phone's", () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(speechLanguage("es-MX")).toBe("es");
  });
});
