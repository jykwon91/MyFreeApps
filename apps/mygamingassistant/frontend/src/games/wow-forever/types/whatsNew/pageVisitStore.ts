import type { PageVisits } from "@/games/wow-forever/types/whatsNew/pageVisits";

/** The update-dot visit record shared by the left nav and the hub tiles. */
export interface PageVisitStore {
  subscribe: (listener: () => void) => () => void;
  /** The stored visits, or null before the first visit. Kept in memory; reloaded when another tab saves. */
  getSnapshot: () => PageVisits | null;
  recordVisit: (page: string) => void;
}
