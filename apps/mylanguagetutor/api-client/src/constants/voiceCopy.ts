import type { VoicePhase } from "../types/session/voice-phase";

/** The microphone control's name in each phase: tapping while the tutor speaks interrupts it. */
const MIC_LABELS: Record<VoicePhase, string> = {
  idle: "Tap to speak",
  listening: "Tap when you're done",
  waiting: "Waiting for the tutor",
  replying: "The tutor is answering",
  speaking: "Tap to interrupt and speak",
};

/** What speaking practice says, on the website and the phone. What only one of them says stays there. */
export const VOICE_COPY = {
  micLabels: MIC_LABELS,
  /** Shown while listening, before any words have been heard. */
  listening: "Listening…",
  noSpeech: "Didn't catch anything. Tap the microphone and try again.",
  /** A call or another app took the microphone mid-answer: nothing was sent. */
  interrupted: "Listening was interrupted, so nothing was sent. Tap the microphone when you're ready.",
  unavailable: "Speech recognition isn't working right now. You can type instead.",
  typeInstead: "Type instead",
  useMicrophone: "Use the microphone",
  micBlocked: "Microphone is blocked",
  privacyHeading: "Before you use the microphone",
  privacyTutor: "The text of what you say is sent to our AI tutor (Anthropic's Claude) to write a reply and suggestions.",
  privacySaved: "Your conversations are saved to your account, encrypted. Deleting your account removes them.",
  privacyContinue: "Continue to microphone",
} as const;
