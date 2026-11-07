import dataRefreshJson from "@/games/wow-forever/data/dataRefresh.json";
import { clientBuildLabel } from "@/games/wow-forever/lib/whatsNew/clientBuildLabel";
import { formatDate } from "@platform/ui";
import type { DataRefresh } from "@/games/wow-forever/types/whatsNew/dataRefresh";

const DATA_REFRESH: DataRefresh = dataRefreshJson;

/** "Game data: patch 1.60.1 (build 70790) · updated Nov 5, 2026" — written by the refresh routine, never by hand. */
export default function DataRefreshLine() {
  return (
    <p className="text-sm text-muted-foreground" data-testid="wow-data-refresh">
      Game data: {clientBuildLabel(DATA_REFRESH.clientBuild)} · updated{" "}
      <time dateTime={DATA_REFRESH.refreshedOn}>{formatDate(DATA_REFRESH.refreshedOn)}</time>
    </p>
  );
}
