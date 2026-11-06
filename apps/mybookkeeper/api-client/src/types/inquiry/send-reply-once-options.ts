import type { InquiryMessage } from "./inquiry-message";

export interface SendReplyOnceOptions {
  /** One attempt with the reply's request id. Rejects with the request's error. */
  post: () => Promise<InquiryMessage>;
  /** Waits between attempts while an earlier one is still sending. */
  delays: readonly number[];
  sleep: (ms: number) => Promise<void>;
  /** Asked before and after each wait; false stops asking (the screen went away). */
  keepGoing: () => boolean;
  onWaiting: (waiting: boolean) => void;
}
