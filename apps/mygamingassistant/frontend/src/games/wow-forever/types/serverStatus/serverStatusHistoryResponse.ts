import type { RulesetHistory } from "@/games/wow-forever/types/serverStatus/rulesetHistory";

/** `GET /wow/server-status/history`: the last 7 days of recorded status for a region. */
export interface ServerStatusHistoryResponse {
  region: string;
  generated_at: string;
  window_start: string;
  check_interval_seconds: number;
  /** A point older than this with nothing after it means the recorder stopped: shown as no data. */
  max_gap_seconds: number;
  rulesets: RulesetHistory[];
}
