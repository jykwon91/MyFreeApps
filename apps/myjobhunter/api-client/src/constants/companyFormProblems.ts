import {
  COMPANY_DOMAIN_MAX_LENGTH,
  COMPANY_HQ_LOCATION_MAX_LENGTH,
  COMPANY_INDUSTRY_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
} from "./companyFieldLimits";

/** Why the add-company form can't be saved yet, worded the same on the website and the phone. */
export const COMPANY_FORM_PROBLEMS = {
  nameRequired: "Name is required",
  nameTooLong: `Keep the name to ${COMPANY_NAME_MAX_LENGTH} characters.`,
  domainTooLong: `Keep the domain to ${COMPANY_DOMAIN_MAX_LENGTH} characters.`,
  industryTooLong: `Keep the industry to ${COMPANY_INDUSTRY_MAX_LENGTH} characters.`,
  hqLocationTooLong: `Keep the HQ location to ${COMPANY_HQ_LOCATION_MAX_LENGTH} characters.`,
  /** The server's 409: another of your companies has this domain. */
  duplicateDomain: "You already have a company with this domain.",
} as const;
