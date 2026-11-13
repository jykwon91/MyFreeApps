import whatsNewJson from "@/games/wow-forever/data/whatsNew.json";
import type { WhatsNewEntry } from "@/games/wow-forever/types/whatsNew/whatsNewEntry";

/**
 * The hub's "What's new on this site" list — hand-written in `whatsNew.json`, NEWEST FIRST
 * (a test checks the order). Date = the day the change merged to main.
 *
 * `to` decides which page's update dot the entry lights: its path must be the
 * hub (`/wow-forever`) or a hub tile's path from `games/registry.ts` (a test
 * checks; triage carries no dot, and an item page counts as the Items page). An entry is remembered as seen by
 * its date + title, so retitling one shows its dot again. Write for players:
 * what they can do now, in one sentence.
 */
export const WHATS_NEW: readonly WhatsNewEntry[] = whatsNewJson;
