import type { EmailQueueItem } from "./email-queue-item";

export interface SessionGroup {
  syncLogId: number;
  items: EmailQueueItem[];
  earliestCreatedAt: string | null;
}
