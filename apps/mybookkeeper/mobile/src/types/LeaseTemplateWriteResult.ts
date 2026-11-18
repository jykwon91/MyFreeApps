import type { LeaseTemplateFailure } from "@mybookkeeper/api-client/types/lease/lease-template-failure";

/** "busy" when a write was already in flight and nothing was sent; "cancelled" when a cache reset called it off. */
export type LeaseTemplateWriteResult = LeaseTemplateFailure | "done" | "busy" | "cancelled";
