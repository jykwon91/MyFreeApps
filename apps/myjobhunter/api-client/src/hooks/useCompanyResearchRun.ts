import { useEffect, useRef } from "react";
import { useTriggerCompanyResearchMutation } from "../store/companiesApi";
import { companyResearchRunKey } from "../utils/companyResearchRunKey";

/**
 * Runs a company's research, with its in-flight state kept in the store rather than in the screen:
 * leave the company and reopen it while a run is going, and the run still shows as running, so it
 * isn't started (and paid for) a second time. Shared by the web panel and the phone section.
 *
 * Only the in-flight state is shared. A finished run's result is in the research cache
 * (`getCompanyResearch`), and its failure belongs to the screen that showed it: leaving clears it,
 * and so does opening the company after a run finished with no screen open, so a reopened company
 * never shows an old failure.
 */
export function useCompanyResearchRun(companyId: string): ReturnType<typeof useTriggerCompanyResearchMutation> {
  const run = useTriggerCompanyResearchMutation({ fixedCacheKey: companyResearchRunKey(companyId) });
  const latest = useRef(run[1]);
  useEffect(() => {
    latest.current = run[1];
  });
  useEffect(() => {
    const clearFinished = () => {
      if (!latest.current.isLoading && !latest.current.isUninitialized) latest.current.reset();
    };
    clearFinished();
    return clearFinished;
  }, [companyId]);
  return run;
}
