import { AVAudioSessionCategory, AVAudioSessionCategoryOptions, AVAudioSessionMode } from "expo-speech-recognition";
import type { SetCategoryOptions } from "expo-speech-recognition";
import { APP_NAME } from "./app";

/** What only the phone says about speaking practice; the rest is the api-client's VOICE_COPY. */
export const PHONE_VOICE_COPY = {
  /** The privacy notice's first line, by where the phone turns speech into text. */
  recognizerOnDevice: "Your phone turns your speech into text on the phone itself: the audio doesn't leave it. We never receive or store your audio.",
  recognizerMaySendIos:
    "Your iPhone turns your speech into text. It does this on the iPhone when it can for this language; otherwise it sends the audio to Apple to do it. We never receive or store your audio.",
  recognizerMaySendAndroid:
    "Your phone's speech service turns your speech into text, and may send the audio to its provider (Google, on most Android phones) to do it. We never receive or store your audio.",
  micBlockedBody: `To practice speaking, allow the microphone for ${APP_NAME} in your phone's Settings (on an iPhone, Speech Recognition too), then come back. You can keep practicing by typing in the meantime.`,
  openSettings: "Open Settings",
  typingOnlyNote: "This phone can't turn speech into text, so you'll practice by typing.",
} as const;

/**
 * iOS's audio session while listening. The recognizer's own default is playAndRecord in measurement
 * mode, which turns playback down; the default mode doesn't. defaultToSpeaker sends any sound played
 * during and after recording to the loudspeaker rather than the earpiece. The tutor's voice has its own
 * system-managed session too (USE_APPLICATION_AUDIO_SESSION), and the app's is let go once listening ends.
 * allowBluetooth lets a Bluetooth headset's microphone be used. Android ignores this.
 */
export const LISTENING_AUDIO_SESSION: SetCategoryOptions = {
  category: AVAudioSessionCategory.playAndRecord,
  categoryOptions: [AVAudioSessionCategoryOptions.defaultToSpeaker, AVAudioSessionCategoryOptions.allowBluetooth],
  mode: AVAudioSessionMode.default,
};

/** The largest microphone control: the one big control of the screen, as on the website. */
export const MIC_BUTTON_SIZE = 72;
export const MIC_GLYPH_SIZE = 30;
export const MIC_PRESSED_OPACITY = 0.85;

/** Back from Settings, the microphone may have been allowed: checked as soon as the app is back. */
export const RECHECK_PERMISSION_MS = 0;
