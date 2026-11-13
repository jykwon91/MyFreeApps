import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";

/** What stubDropsApi hands back: every write the page sent, and every ?status= the list was read with ("" for none). */
export interface DropsApiStub {
  writes: SentRequest[];
  listStatuses: string[];
}
