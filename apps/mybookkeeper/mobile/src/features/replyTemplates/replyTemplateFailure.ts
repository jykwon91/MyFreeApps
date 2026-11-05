import type { ReplyTemplateFailure } from "@mybookkeeper/api-client/types/inquiry/reply-template-failure";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";

/** The banner for a failure, or null when it shows somewhere else. */
export function saveBanner(failure: ReplyTemplateFailure): string | null {
  switch (failure) {
    case "noResponse":
      return REPLY_TEMPLATE_MESSAGES.couldntReach;
    case "viewOnly":
      return REPLY_TEMPLATE_MESSAGES.saveViewOnly;
    case "unsure":
      return REPLY_TEMPLATE_MESSAGES.saveUnsure;
    case "serverError":
    case "other":
      return REPLY_TEMPLATE_MESSAGES.saveFailed;
    case "nameTaken":
    case "gone":
      return null;
  }
}
