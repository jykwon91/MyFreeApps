/**
 * `server_status` — the Server status page's live check (`/api/wow/server-status`).
 * When Blizzard can't be reached Claude is told so, never that the servers are down.
 */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_LIVE } from "@/games/wow-forever/data/ask/askLiveStates";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import { serverStatusHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import { regionLabel } from "@/games/wow-forever/lib/ask/askRegion";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { AskRegionInput } from "@/games/wow-forever/types/ask/askRegionInput";
import type { AskServerStatusCard } from "@/games/wow-forever/types/ask/askServerStatusCard";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { ServerStatusResponse } from "@/games/wow-forever/types/serverStatus/serverStatusResponse";

export async function serverStatusTool(input: AskRegionInput, data: AskToolData): Promise<AskToolOutcome> {
  const region = input.region ?? data.region;
  const card: AskServerStatusCard = {
    kind: ASK_CARD.serverStatus,
    region,
    state: ASK_LIVE.error,
    rulesets: [],
    checkedAt: null,
    pageHref: serverStatusHref(),
  };

  let status: ServerStatusResponse;
  try {
    status = await data.loadServerStatus(region);
  } catch {
    return { content: JSON.stringify({ error: ASK_TOOL_NOTE.statusFailed }), isError: true, card };
  }

  const listed = status.rulesets.length > 0;
  const result = {
    region: regionLabel(region),
    checked: relativeTime(status.checked_at),
    note: listed ? null : ASK_TOOL_NOTE.statusNone,
    rulesets: status.rulesets.map((r) => ({ name: r.name, up: r.online })),
  };
  return {
    content: JSON.stringify(result),
    isError: false,
    card: {
      ...card,
      state: listed ? ASK_LIVE.ready : ASK_LIVE.none,
      rulesets: status.rulesets,
      checkedAt: status.checked_at,
    },
  };
}
