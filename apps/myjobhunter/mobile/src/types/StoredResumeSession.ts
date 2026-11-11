/** The session the phone reopens, read from the phone's storage when the screen opens. */
export interface StoredResumeSession {
  /** True until storage has answered; nothing is shown as missing before then. */
  isReading: boolean;
  sessionId: string | null;
  remember: (id: string) => void;
  forget: () => void;
}
