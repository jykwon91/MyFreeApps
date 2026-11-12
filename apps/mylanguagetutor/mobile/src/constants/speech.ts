import type { Voice } from "expo-speech";

/**
 * iOS: the tutor's voice uses a session the system manages for spoken audio, not the app's own
 * audio session (expo-speech's `useApplicationAudioSession: false`, AVSpeechSynthesizer's
 * `usesApplicationAudioSession`). The app's session is left at iOS's default, and voice input will
 * later need it set for recording, which on iOS sends sound to the earpiece unless told otherwise:
 * with its own session, speech stays on the loudspeaker whatever the app's session is set to. The
 * system's session also ducks other audio, such as music, rather than stopping it. Android ignores
 * this; its text-to-speech plays as media, through the loudspeaker, and isn't silenced by the ringer.
 */
export const USE_APPLICATION_AUDIO_SESSION = false;

/** What the tutor speaks with when the phone lists no voices. */
export const NO_VOICES: readonly Voice[] = [];

/**
 * iOS's novelty and legacy voices (Eloquence's Eddy, Flo..., and the old macOS-style Bells, Bubbles,
 * Zarvox...): they speak the language but aren't a voice to learn pronunciation from.
 */
export const NOVELTY_VOICE_PREFIXES = ["com.apple.eloquence.", "com.apple.speech.synthesis.voice."] as const;

/** Android names its voices `<locale>-x-<id>-local` or `-network`: on the device, or streamed. */
export const ANDROID_LOCAL_VOICE_MARK = "-local";
export const ANDROID_NETWORK_VOICE_MARK = "-network";

/** iOS's premium voices: better than its enhanced ones, but expo-speech reports them as Default quality. */
export const IOS_PREMIUM_VOICE_MARK = ".premium.";
