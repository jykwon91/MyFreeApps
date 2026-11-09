import type { ReviewQueuePayload } from "./review-queue-payload";

export interface ReviewQueueItem {
  id: string;
  email_message_id: string;
  source_channel: string;
  parsed_payload: ReviewQueuePayload;
  status: "pending" | "resolved" | "ignored";
  created_at: string;
}
