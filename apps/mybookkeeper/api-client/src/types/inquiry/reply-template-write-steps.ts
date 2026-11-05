import type { ReplyTemplate } from "./reply-template";

/** The write to try, and how to reload the list it takes the template out of. */
export interface ReplyTemplateWriteSteps {
  write: () => Promise<unknown>;
  reloadList: () => Promise<{ isSuccess: boolean; data?: ReplyTemplate[] }>;
}
