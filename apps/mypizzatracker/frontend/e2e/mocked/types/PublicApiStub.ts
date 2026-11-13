import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";

/** What stubPublicApi hands back: every order the page placed, and every phone it looked up. */
export interface PublicApiStub {
  writes: SentRequest[];
  lookups: string[];
}
