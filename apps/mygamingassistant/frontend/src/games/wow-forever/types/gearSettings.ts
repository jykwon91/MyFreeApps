import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { GearView } from "@/games/wow-forever/data/gear/gearViews";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** The Best gear page's question: who you are and which table you're looking at. */
export interface GearSettings {
  classId: WowClassId;
  /** Always a real spec of the class — Level 60 weights need one. */
  specId: string;
  /** Null = not entered yet. */
  level: number | null;
  faction: PlayerFaction;
  view: GearView;
  /** Include PvP gear (honor ranks, battleground reputations, Forever's Premier sets) in both tables. */
  includePvp: boolean;
}
