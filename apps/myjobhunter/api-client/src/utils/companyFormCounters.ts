import {
  COMPANY_DOMAIN_MAX_LENGTH,
  COMPANY_HQ_LOCATION_MAX_LENGTH,
  COMPANY_INDUSTRY_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
} from "../constants/companyFieldLimits";
import type { CharacterCounters } from "../types/character-counters";
import type { CompanyFormValues } from "../types/company/company-form-values";
import { countersFor } from "./countersFor";

export function companyFormCounters(values: CompanyFormValues): CharacterCounters<keyof CompanyFormValues> {
  return countersFor(values, {
    name: COMPANY_NAME_MAX_LENGTH,
    primary_domain: COMPANY_DOMAIN_MAX_LENGTH,
    industry: COMPANY_INDUSTRY_MAX_LENGTH,
    hq_location: COMPANY_HQ_LOCATION_MAX_LENGTH,
  });
}
