/**
 * Longest values POST /companies accepts (`CompanyCreateRequest`: `_NAME_MAX_LEN`, `_DOMAIN_MAX_LEN`,
 * `_INDUSTRY_MAX_LEN`, `_HQ_MAX_LEN`), which mirror the `Company` model's String() lengths.
 */
export const COMPANY_NAME_MAX_LENGTH = 200;
export const COMPANY_DOMAIN_MAX_LENGTH = 255;
export const COMPANY_INDUSTRY_MAX_LENGTH = 100;
export const COMPANY_HQ_LOCATION_MAX_LENGTH = 200;
