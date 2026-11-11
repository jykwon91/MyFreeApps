import type { Company } from "../company";

/** The Company fields the Companies list shows when they're set, and sorts last when they aren't. */
export type OptionalCompanyTextField = keyof Pick<Company, "primary_domain" | "industry" | "hq_location">;
