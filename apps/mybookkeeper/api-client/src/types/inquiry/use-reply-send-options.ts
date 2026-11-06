import type { ReplyRequestIdStore } from "./reply-request-id-store";

export interface UseReplySendOptions {
  /** From the platform: `crypto.randomUUID` on the web. */
  newRequestId: () => string;
  requestIds: ReplyRequestIdStore;
}
