/** One sentence handed to a platform's speech engine by the shared speech queue. */
export interface QueuedSentence {
  /** No stop has happened since it was queued: false once the queue has moved on. */
  isCurrent: () => boolean;
  /** The engine has said it, stopped it or failed on it. Ignored once speech has stopped since it was queued. */
  done: () => void;
}
