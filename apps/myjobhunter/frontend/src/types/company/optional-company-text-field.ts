import type { Company } from "@myjobhunter/api-client/types/company";

/** The Company fields the Companies table shows as optional muted text. */
export type OptionalCompanyTextField = keyof Pick<Company, "primary_domain" | "industry" | "hq_location">;
