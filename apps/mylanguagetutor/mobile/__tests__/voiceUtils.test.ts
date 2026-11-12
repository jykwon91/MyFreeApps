import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { Platform } from "react-native";
import { LISTENING_AUDIO_SESSION, PHONE_VOICE_COPY } from "../src/constants/voice";
import { hasInstalledLocale } from "../src/utils/hasInstalledLocale";
import { heardFromResult } from "../src/utils/heardFromResult";
import { phaseAnnouncement } from "../src/utils/phaseAnnouncement";
import { privacyAckCovers } from "../src/utils/privacyAckCovers";
import { recognitionOptions } from "../src/utils/recognitionOptions";
import { recognizerPrivacy } from "../src/utils/recognizerPrivacy";
import { recognizerPrivacyCopy } from "../src/utils/recognizerPrivacyCopy";

let platform: jest.ReplaceProperty<typeof Platform.OS> | null = null;

afterEach(() => {
  platform?.restore();
  platform = null;
});

function onAndroid(): void {
  platform = jest.replaceProperty(Platform, "OS", "android");
}

describe("hasInstalledLocale", () => {
  it.each(["es-MX", "es_MX", "es-mx"])("finds es-MX written as %s", (installed) => {
    expect(hasInstalledLocale(["en-US", installed], "es-MX")).toBe(true);
  });

  it("doesn't count another country's Spanish", () => {
    expect(hasInstalledLocale(["es-ES"], "es-MX")).toBe(false);
    expect(hasInstalledLocale([], "es-MX")).toBe(false);
  });
});

describe("heardFromResult", () => {
  const result = (transcript: string, isFinal: boolean) => ({ isFinal, results: [{ transcript, confidence: 0.9, segments: [] }] });

  it("takes the best guess as the words still changing, or as settled once final", () => {
    expect(heardFromResult(result("Quiero un", false))).toEqual({ finalText: "", interimText: "Quiero un" });
    expect(heardFromResult(result("Quiero un café", true))).toEqual({ finalText: "Quiero un café", interimText: "" });
  });

  it("hears nothing from a result with no guesses", () => {
    expect(heardFromResult({ isFinal: true, results: [] })).toEqual({ finalText: "", interimText: "" });
  });
});

describe("privacyAckCovers", () => {
  it("covers on-device recognition once the learner read that audio may leave the phone", () => {
    expect(privacyAckCovers("may_send", "on_device")).toBe(true);
    expect(privacyAckCovers("may_send", "may_send")).toBe(true);
    expect(privacyAckCovers("on_device", "on_device")).toBe(true);
  });

  it("doesn't cover audio leaving the phone when the learner read it wouldn't, or read nothing", () => {
    expect(privacyAckCovers("on_device", "may_send")).toBe(false);
    expect(privacyAckCovers(null, "on_device")).toBe(false);
  });
});

describe("recognizerPrivacy", () => {
  it("is unknown until the phone has said", () => {
    expect(recognizerPrivacy(null)).toBeNull();
    expect(recognizerPrivacy(true)).toBe("on_device");
    expect(recognizerPrivacy(false)).toBe("may_send");
  });
});

describe("recognizerPrivacyCopy", () => {
  it("names Apple on an iPhone and the phone's speech service on Android", () => {
    expect(recognizerPrivacyCopy("may_send")).toBe(PHONE_VOICE_COPY.recognizerMaySendIos);
    onAndroid();
    expect(recognizerPrivacyCopy("may_send")).toBe(PHONE_VOICE_COPY.recognizerMaySendAndroid);
    expect(recognizerPrivacyCopy("on_device")).toBe(PHONE_VOICE_COPY.recognizerOnDevice);
  });
});

describe("recognitionOptions", () => {
  it("always asks iOS for on-device recognition, which it applies where the language has it", () => {
    expect(recognitionOptions("es-MX", false)).toEqual({
      lang: "es-MX",
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: true,
      iosCategory: LISTENING_AUDIO_SESSION,
    });
  });

  it("asks Android for it only where it has the language installed", () => {
    onAndroid();
    expect(recognitionOptions("es-MX", true).requiresOnDeviceRecognition).toBe(true);
    expect(recognitionOptions("es-MX", false).requiresOnDeviceRecognition).toBe(false);
  });

  it("plays sound on the loudspeaker, without measurement mode turning it down", () => {
    expect(LISTENING_AUDIO_SESSION).toEqual({ category: "playAndRecord", categoryOptions: ["defaultToSpeaker", "allowBluetooth"], mode: "default" });
  });
});

describe("phaseAnnouncement", () => {
  it("tells screen readers the answer went off", () => {
    expect(phaseAnnouncement("waiting", "voice")).toBe(VOICE_COPY.micLabels.waiting);
  });

  it.each(["idle", "listening", "replying", "speaking"] as const)("says nothing on %s", (phase) => {
    expect(phaseAnnouncement(phase, "voice")).toBeUndefined();
  });

  it("says nothing while typing, which has its own Sending state", () => {
    expect(phaseAnnouncement("waiting", "text")).toBeUndefined();
  });
});
