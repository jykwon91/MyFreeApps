import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";
import { useOnDeviceRecognition } from "../src/hooks/useOnDeviceRecognition";
import { ExpoSpeechRecognitionModule, installRecognizer, resetRecognizer } from "../test-support/fakeSpeechRecognition";

let platform: jest.ReplaceProperty<typeof Platform.OS> | null = null;

beforeEach(() => resetRecognizer());

afterEach(() => {
  platform?.restore();
  platform = null;
});

describe("useOnDeviceRecognition", () => {
  it("is not on-device on an iPhone, which can't say for a language", async () => {
    installRecognizer({ onDevice: true, installedLocales: ["es-MX"] });
    const { result } = await renderHook(() => useOnDeviceRecognition("es-MX"));
    expect(result.current).toBe(false);
  });

  it("is unknown again for a new language until Android answers for it", async () => {
    platform = jest.replaceProperty(Platform, "OS", "android");
    installRecognizer({ onDevice: true, installedLocales: ["es-MX"] });
    const { result, rerender } = await renderHook(({ locale }: { locale: string }) => useOnDeviceRecognition(locale), { initialProps: { locale: "es-MX" } });
    expect(result.current).toBe(true);

    let answer: (locales: { locales: string[]; installedLocales: string[] }) => void = () => {};
    jest.spyOn(ExpoSpeechRecognitionModule, "getSupportedLocales").mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await rerender({ locale: "fr-FR" });
    expect(result.current).toBeNull();
    await act(async () => answer({ locales: ["es-MX"], installedLocales: ["es-MX"] }));
    expect(result.current).toBe(false);
  });
});
