import type { Company } from "@myjobhunter/api-client/types/company";
import { companyFieldText } from "@myjobhunter/api-client/utils/companyFieldText";

/** Industry and HQ, leaving out whichever the company doesn't have. Null if neither. */
export function companyDetails(company: Company): string | null {
  const parts = [companyFieldText(company, "industry"), companyFieldText(company, "hq_location")].filter(
    (part): part is string => part !== undefined,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Everything the row shows, in the order it shows it, for a screen reader. */
export function companyRowLabel(company: Company): string {
  return [
    company.name,
    companyFieldText(company, "primary_domain"),
    companyFieldText(company, "industry"),
    companyFieldText(company, "hq_location"),
  ]
    .filter((part): part is string => part !== undefined)
    .join(", ");
}
