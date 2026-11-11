import { COMPANY_SLUG_PATTERN } from "../constants/savedSearchProblems";

/** True while a company slug being typed already can't be valid; an empty field isn't flagged yet. */
export function isTypedCompanySlugInvalid(slug: string): boolean {
  return slug.length > 0 && !COMPANY_SLUG_PATTERN.test(slug.toLowerCase());
}
