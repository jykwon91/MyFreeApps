/**
 * Replies are read on the screen, not spoken, until the app has spoken replies: the conversation
 * hook still hands each finished sentence here, so speech plugs in without changing it.
 */
export const NO_SPEECH = {
  speak: (_sentence: string) => {},
  stopSpeaking: () => {},
} as const;
