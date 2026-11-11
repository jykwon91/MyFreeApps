import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { Document } from "./document";

/** A paged documents list, as a screen needs it: `documents` is every loaded row, newest first. */
export interface DocumentsPagesState extends Omit<InfinitePagesResult<Document>, "items"> {
  documents: Document[];
}
