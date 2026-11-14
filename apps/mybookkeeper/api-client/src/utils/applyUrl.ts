import { APPLY_PATH_PREFIX } from "../constants/applyUrl";

/** The public inquiry-form URL for a listing. The base URL is passed in so this stays platform-neutral. */
export function buildApplyUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${APPLY_PATH_PREFIX}/${slug}`;
}
