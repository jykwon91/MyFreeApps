import type { ServerStatusValue } from "@/games/wow-forever/types/serverStatus/serverStatusValue";

/** A recorded status from `at` onwards (ISO 8601, UTC), until the next point. */
export interface ServerStatusPoint {
  at: string;
  status: ServerStatusValue;
}
