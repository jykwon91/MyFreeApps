import { SERVICE_KIND, type ServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { WAYPOINT_KIND, type WaypointKind } from "@/games/wow-forever/types/waypointsAddon/waypointKind";

/**
 * Which World Map service NPCs MGA Waypoints can guide you to, and what it calls them. Vendors, stable masters,
 * weapon masters and riding trainers are left out: the picker has no category for them.
 */
export const SERVICE_WAYPOINT_KIND: Readonly<Partial<Record<ServiceKind, WaypointKind>>> = {
  [SERVICE_KIND.classTrainer]: WAYPOINT_KIND.classTrainer,
  [SERVICE_KIND.petTrainer]: WAYPOINT_KIND.petTrainer,
  [SERVICE_KIND.demonTrainer]: WAYPOINT_KIND.demonTrainer,
  [SERVICE_KIND.professionTrainer]: WAYPOINT_KIND.professionTrainer,
  [SERVICE_KIND.flightMaster]: WAYPOINT_KIND.flightMaster,
  [SERVICE_KIND.repair]: WAYPOINT_KIND.repair,
  [SERVICE_KIND.innkeeper]: WAYPOINT_KIND.innkeeper,
  [SERVICE_KIND.banker]: WAYPOINT_KIND.bank,
  [SERVICE_KIND.auctioneer]: WAYPOINT_KIND.auctionHouse,
};

/** The title a dungeon or raid entrance carries in the picker; its level follows. */
export const DUNGEON_TITLE = "Dungeon";
export const RAID_TITLE = "Raid";
/** More players than this and an instance is a raid. */
export const MAX_DUNGEON_PLAYERS = 5;
