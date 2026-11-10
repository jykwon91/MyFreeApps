import type { LeaseTemplateFailure } from "@mybookkeeper/api-client/types/lease/lease-template-failure";

/** "busy" when a write was already in flight and nothing was sent. */
export type LeaseTemplateWriteResult = LeaseTemplateFailure | "done" | "busy";
