/**
 * Hook that derives the research panel display mode from RTK Query state.
 *
 * Returns one of four discriminated states:
 *   'no-research' — query returned 404 (no research run yet)
 *   'loading'     — mutation is in-flight (run triggered but not complete)
 *   'ready'       — research record exists and is loaded
 *   'failed'      — mutation or query errored with a non-404 status
 */
import type { CompanyResearch } from "@/types/company-research";

export type CompanyResearchMode = "no-research" | "loading" | "ready" | "failed";

interface UseCompanyResearchModeParams {
  research: CompanyResearch | undefined;
  isQueryError: boolean;
  queryErrorStatus: number | undefined;
  isMutationLoading: boolean;
  isMutationError: boolean;
}

export function useCompanyResearchMode({
  research,
  isQueryError,
  queryErrorStatus,
  isMutationLoading,
  isMutationError,
}: UseCompanyResearchModeParams): CompanyResearchMode {
  if (isMutationLoading) {
    return "loading";
  }

  if (research) {
    return "ready";
  }

  if (isQueryError && queryErrorStatus === 404) {
    return "no-research";
  }

  if (isQueryError || isMutationError) {
    return "failed";
  }

  // Initial state before the query has resolved — treat as no-research
  // so the panel renders without flicker.
  return "no-research";
}
