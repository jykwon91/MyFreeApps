import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListWelcomeManualPagesInfiniteQuery } from "../store/welcomeManualsApi";
import type { WelcomeManualsPagesState } from "../types/welcome-manual/welcome-manuals-pages-state";

/** GET /welcome-manuals a page at a time. Shared by the website's manuals list and the phone's. */
export function useWelcomeManualsPages(): WelcomeManualsPagesState {
  const { items, ...pages } = useInfinitePages(useListWelcomeManualPagesInfiniteQuery());
  return { ...pages, manuals: items };
}
