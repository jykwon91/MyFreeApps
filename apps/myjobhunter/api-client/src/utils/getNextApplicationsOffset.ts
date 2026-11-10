import type { ApplicationListResponse } from "../types/application-list-response";

/**
 * Where the next page starts, or undefined once every matching row is loaded.
 * Counts the rows the last page actually held, so a server that returns fewer
 * than asked never leaves a gap, and an empty page always ends the list.
 */
export function getNextApplicationsOffset(lastPage: ApplicationListResponse, lastOffset: number): number | undefined {
  const nextOffset = lastOffset + lastPage.items.length;
  return lastPage.items.length === 0 || nextOffset >= lastPage.total ? undefined : nextOffset;
}
