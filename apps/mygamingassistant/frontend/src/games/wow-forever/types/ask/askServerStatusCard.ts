import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskLiveState } from "@/games/wow-forever/types/ask/askLiveState";
import type { ServerRuleset } from "@/games/wow-forever/types/serverStatus/serverRuleset";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

/** `server_status`: each ruleset up or down and when it was checked; `error` = Blizzard couldn't be reached. */
export interface AskServerStatusCard {
  kind: typeof ASK_CARD.serverStatus;
  region: WowRegion;
  state: AskLiveState;
  rulesets: ServerRuleset[];
  /** ISO time; null when the check failed. */
  checkedAt: string | null;
  pageHref: string;
}
