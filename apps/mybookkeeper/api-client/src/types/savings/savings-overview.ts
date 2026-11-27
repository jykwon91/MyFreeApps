import type { SavingsIdea } from "./savings-idea";
import type { SavingsRun } from "./savings-run";

/** ``GET /savings``: everything the Savings page shows. */
export interface SavingsOverview {
  research_enabled: boolean;
  /** Sum over ``ideas``. */
  total_savings_low_cents: number;
  total_savings_high_cents: number;
  last_researched_at: string | null;
  /** Null while research is off or a run is going. */
  next_research_due_at: string | null;
  run_in_progress: boolean;
  latest_run: SavingsRun | null;
  manual_runs_left: number;
  manual_run_limit: number;
  /** When "Research now" works again; null unless the limit is reached. */
  next_manual_run_at: string | null;
  /** Open ideas, biggest saving first. */
  ideas: SavingsIdea[];
}
