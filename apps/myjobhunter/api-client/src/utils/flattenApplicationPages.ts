import type { Application } from "../types/application";
import type { ApplicationListResponse } from "../types/application-list-response";

/**
 * Every loaded page as one list, in order. An application added or removed
 * between page loads shifts the offsets, so a row can arrive twice; it is
 * kept where it first appeared.
 */
export function flattenApplicationPages(pages: readonly ApplicationListResponse[] | undefined): Application[] {
  const seen = new Set<string>();
  const rows: Application[] = [];
  for (const page of pages ?? []) {
    for (const application of page.items) {
      if (seen.has(application.id)) continue;
      seen.add(application.id);
      rows.push(application);
    }
  }
  return rows;
}
