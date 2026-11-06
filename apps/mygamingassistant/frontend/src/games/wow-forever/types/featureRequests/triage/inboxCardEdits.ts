import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";

/** The private row on an inbox card, sent with Approve. */
export interface InboxCardEdits {
  priority: number | null;
  area: FeatureArea;
}
