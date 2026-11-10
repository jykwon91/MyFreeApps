import type { LeaseTemplateFailure } from "./lease-template-failure";

/** What to tell the person for each way a template write can fail. */
export type LeaseTemplateFailureCopy = Record<LeaseTemplateFailure, string>;
