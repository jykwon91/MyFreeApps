import type { EmailQueueItem } from "./email-queue";

export interface SessionGroup {
  syncLogId: number;
  items: EmailQueueItem[];
  earliestCreatedAt: string | null;
}
