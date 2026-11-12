/** What one listening attempt had come to when a recognition event arrived. */
export interface RecognitionAttempt {
  /** The recognizer reported any words in this attempt, interim or final. */
  anythingHeard: boolean;
  /** The recognizer settled on a final result in this attempt: the answer is finished. */
  settled: boolean;
  /** The learner asked to send what they said: they tapped stop, or switched to typing. */
  stopRequested: boolean;
}
