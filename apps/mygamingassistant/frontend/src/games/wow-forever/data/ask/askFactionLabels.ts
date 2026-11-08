import { FACTION, type Faction } from "@/games/wow-forever/types/worldMap";

/** A faction as the chat's tool results and cards spell it. */
export const ASK_FACTION_LABEL: Readonly<Record<Faction, string>> = {
  [FACTION.alliance]: "Alliance",
  [FACTION.horde]: "Horde",
  [FACTION.neutral]: "Neutral",
};

/** What a tool result says for a setting the player hasn't made. */
export const ASK_NOT_SET = "not set";
