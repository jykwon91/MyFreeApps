import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { startCompanyResearchRun } from "../store/companiesApi";
import type { CompanyResearch } from "../types/company-research";
import type { CompanyResearchDispatch } from "../types/company/company-research-dispatch";

/**
 * Starts a company's research from away from its screen, under the key the screen reads: open the
 * company while the run is going and it shows the run, not a Run research button for a second one.
 */
export function useStartCompanyResearch(): (companyId: string) => Promise<CompanyResearch> {
  const dispatch = useDispatch<CompanyResearchDispatch>();
  return useCallback((companyId: string) => dispatch(startCompanyResearchRun(companyId)).unwrap(), [dispatch]);
}
