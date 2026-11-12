/** What the recognizer has heard of one utterance so far: the settled words, and the guess still changing after them. */
export interface HeardSpeech {
  finalText: string;
  interimText: string;
}
