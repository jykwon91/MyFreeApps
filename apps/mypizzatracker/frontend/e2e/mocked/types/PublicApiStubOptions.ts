import type { PublicCustomerLookup, PublicOrderConfirmation } from "@/types/public/public";

export interface PublicApiStubOptions {
  /** No drop is taking orders: GET /public/drops/current answers 404. */
  noActiveDrop?: boolean;
  /** Orders already placed, readable at GET /public/orders/{id}. */
  orders?: PublicOrderConfirmation[];
  /** A returning customer the phone lookup finds, by the digits they type. */
  knownCustomers?: Record<string, PublicCustomerLookup>;
}
