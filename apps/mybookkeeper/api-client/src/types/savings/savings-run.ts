import type { SavingsRunStatus } from "./savings-run-status";

/** A research run's outcome. */
export interface SavingsRun {
  id: string;
  trigger: "scheduled" | "manual";
  status: SavingsRunStatus;
  started_at: string;
  finished_at: string | null;
  /** Why a failed run failed (``refusal``, ``rate_limit_error``, ...); null otherwise. */
  error_type: string | null;
  ideas_found: number;
}
