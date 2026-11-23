import type { SecondaryProfession } from "@/games/wow-forever/types/secondaryProfession";

/** The site gives Cooking and Fishing no one-line route intro, so the addon says it the way the crafting guides do. */
export const SECONDARY_ROUTE_INTRO: Readonly<Record<SecondaryProfession, string>> = {
  cooking: "Cook each row until it turns green, then move on to the next row. Learn a rank when the route says so.",
  fishing: "Fish where each row says until your skill passes it, then move on to the next row. Learn a rank when the route says so.",
};
