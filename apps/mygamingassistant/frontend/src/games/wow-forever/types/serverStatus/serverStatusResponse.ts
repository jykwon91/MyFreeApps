import type { ServerRuleset } from "@/games/wow-forever/types/serverStatus/serverRuleset";

/** `GET /wow/server-status`: a region's live status. */
export interface ServerStatusResponse {
  region: string;
  checked_at: string;
  rulesets: ServerRuleset[];
}
