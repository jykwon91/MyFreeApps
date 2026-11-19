import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { PagedListStatus } from "./PagedListStatus";

/** What a picker reads from its api-client `use<X>Pages` hook to load its choices a page at a time. */
export type PagedListPages = PagedListStatus & Pick<InfinitePagesResult<unknown>, "loadMore">;
