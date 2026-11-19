import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { Mortgage } from "./mortgage";

/** A paged mortgages list, as a screen needs it: `mortgages` is every loaded row, in the server's order. */
export interface MortgagesPagesState extends Omit<InfinitePagesResult<Mortgage>, "items"> {
  mortgages: Mortgage[];
}
