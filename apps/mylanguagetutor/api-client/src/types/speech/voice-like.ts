/**
 * What choosing a voice needs to know about one: the browser's ``SpeechSynthesisVoice`` and the
 * phone's voices both have a BCP-47 language. The rest is what a platform can say: the browser
 * whether a voice runs on the device (``localService``), the phone whether it is an enhanced,
 * higher-quality voice (``enhanced``) and, on Android, whether it runs on the device. Left out
 * where the platform doesn't tell.
 */
export interface VoiceLike {
  lang: string;
  localService?: boolean;
  enhanced?: boolean;
}
