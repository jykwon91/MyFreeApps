import type { InquiryListArgs } from "./inquiry-list-args";

/** What narrows the list. The page itself comes from the infinite query. */
export type InquiryPageArgs = Omit<InquiryListArgs, "limit" | "offset">;
