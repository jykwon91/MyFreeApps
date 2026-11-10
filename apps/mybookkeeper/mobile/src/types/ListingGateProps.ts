import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import type { ReactElement } from "react";

export interface ListingGateProps {
  id: string;
  /** For screens that change things: a viewer sees why they can't, not a form that will fail. */
  requireWrite?: boolean;
  children: (listing: ListingResponse) => ReactElement;
}
