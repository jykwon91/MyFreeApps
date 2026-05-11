/**
 * Per-source config shapes for discovery saved searches.
 *
 * Each discriminated variant maps 1:1 to the backend Pydantic config model.
 * Changes to any backend config schema MUST update the matching type here
 * in the same PR (per feedback_enum_changes_cross_stack.md).
 */

/** Config for a JSearch (Google Jobs aggregator) saved search. */
export interface JSearchConfig {
  roles: string[];
  skills: string[];
  location?: string;
  country: "us" | "ca" | "uk" | "au";
  date_posted: "all" | "today" | "3days" | "week" | "month";
  remote_jobs_only: boolean;
  employment_type: "" | "FULLTIME" | "PARTTIME" | "CONTRACTOR" | "INTERN";
  experience:
    | ""
    | "no_experience"
    | "under_3_years_experience"
    | "more_than_3_years_experience"
    | "no_degree";
  min_salary_usd?: number;
  excluded_industry_chips?: string[];
  excluded_keywords?: string[];
}

/** Config for a Greenhouse public job-board saved search. */
export interface GreenhouseConfig {
  /** The board token from the URL: boards.greenhouse.io/<board_token> */
  board_token: string;
}

/** Config for a Lever public job-board saved search. */
export interface LeverConfig {
  /** The company slug from the URL: jobs.lever.co/<company_slug> */
  company_slug: string;
}

/**
 * Discriminated union of all source configs that have shipped adapters.
 * Loose-typed sources (ashby, remoteok, etc.) still use Record<string, unknown>
 * until their adapters land.
 */
export type DiscoverySourceConfig =
  | { source: "jsearch"; config: JSearchConfig }
  | { source: "greenhouse"; config: GreenhouseConfig }
  | { source: "lever"; config: LeverConfig }
  | { source: string; config: Record<string, unknown> };
