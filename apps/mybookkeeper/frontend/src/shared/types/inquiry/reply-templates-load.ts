import type { ReplyTemplatesLoadMode } from "./reply-templates-load-mode";

/** What a reply-templates panel shows, and its Try again. */
export interface ReplyTemplatesLoad {
  mode: ReplyTemplatesLoadMode;
  retry: () => Promise<void>;
  isRetrying: boolean;
}
