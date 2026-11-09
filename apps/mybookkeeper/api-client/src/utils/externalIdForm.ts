import { EXTERNAL_ID_FORM_PROBLEMS } from "../constants/externalIdForm";
import type { ListingExternalId } from "../types/listing/listing-external-id";
import type { ListingExternalIdUpdateRequest } from "../types/listing/listing-external-id-update-request";

export const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;

/** What's wrong with an external link's fields, or null when it can be saved. */
export function externalIdProblem(externalId: string, externalUrl: string): string | null {
  const id = externalId.trim();
  const url = externalUrl.trim();
  if (!id && !url) return EXTERNAL_ID_FORM_PROBLEMS.needsOne;
  if (url && !HTTP_URL_PATTERN.test(url)) return EXTERNAL_ID_FORM_PROBLEMS.urlInvalid;
  return null;
}

export function externalIdFormToRequest(externalId: string, externalUrl: string): ListingExternalIdUpdateRequest {
  return { external_id: externalId.trim() || null, external_url: externalUrl.trim() || null };
}

export function externalIdChanged(existing: ListingExternalId, externalId: string, externalUrl: string): boolean {
  const sent = externalIdFormToRequest(externalId, externalUrl);
  return sent.external_id !== existing.external_id || sent.external_url !== existing.external_url;
}
