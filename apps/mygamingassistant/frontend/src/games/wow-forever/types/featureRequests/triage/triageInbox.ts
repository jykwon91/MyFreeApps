import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";

/** `GET /wow/feature-requests/triage/inbox` — untriaged submissions, oldest first (capped), and the full count. */
export interface TriageInbox {
  items: TriageInboxItem[];
  total_untriaged: number;
}
