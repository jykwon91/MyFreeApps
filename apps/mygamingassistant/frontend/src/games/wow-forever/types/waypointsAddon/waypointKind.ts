/** What a place in MGA Waypoints is. The addon's categories group these kinds (`Core.lua`'s `CATEGORIES`). */
export const WAYPOINT_KIND = {
  classTrainer: "class",
  petTrainer: "pet",
  demonTrainer: "demon",
  professionTrainer: "prof",
  flightMaster: "flight",
  repair: "repair",
  innkeeper: "inn",
  bank: "bank",
  auctionHouse: "ah",
  dungeon: "dungeon",
  place: "place",
} as const;

export type WaypointKind = (typeof WAYPOINT_KIND)[keyof typeof WAYPOINT_KIND];
