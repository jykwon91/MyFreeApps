import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";

/** What stubCustomersApi hands back: every write the page sent, and every ?search= the list was read with ("" for none). */
export interface CustomersApiStub {
  writes: SentRequest[];
  searches: string[];
}
