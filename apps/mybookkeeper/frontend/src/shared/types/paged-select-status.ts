import type { PagedListStatus } from "@/shared/types/paged-list-status";
import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";

/** What a paged dropdown reads from its api-client `use<X>Pages` hook: its load status, and whether there is another page. */
export type PagedSelectStatus = PagedListStatus & Pick<InfinitePagesResult<unknown>, "hasNextPage">;
