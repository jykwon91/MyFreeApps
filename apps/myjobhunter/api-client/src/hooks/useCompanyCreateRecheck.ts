import { useListCompaniesQuery } from "../store/companiesApi";
import type { Company } from "../types/company";
import type { LostCreateRecheck } from "../types/write/lost-create-recheck";
import { useLostCreateRecheck } from "./useLostCreateRecheck";

/**
 * Whether a company add whose answer was lost made the company after all: a new company with the name that was sent (trimmed,
 * as the request sends it). Names aren't unique, so one already tracked under that name doesn't count.
 */
export function useCompanyCreateRecheck(): LostCreateRecheck<string, Company> {
  const { currentData, refetch } = useListCompaniesQuery();
  return useLostCreateRecheck(currentData?.items, async () => (await refetch().unwrap()).items, (company, name: string) => company.name === name);
}
