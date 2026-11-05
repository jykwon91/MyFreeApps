import type { ReplyTemplate } from "../types/inquiry/reply-template";
import type { ReplyTemplateRestoreOutcome } from "../types/inquiry/reply-template-restore-outcome";
import { checkStillListed } from "./checkStillListed";
import { restoreFailure } from "./replyTemplateFailure";

interface RestoreDeps {
  restore: () => Promise<unknown>;
  reloadArchived: () => Promise<{ isSuccess: boolean; data?: ReplyTemplate[] }>;
}

/** The server commits before it answers, so a lost answer or a 5xx is settled by the reloaded archived list. */
export async function restoreReplyTemplate(id: string, deps: RestoreDeps): Promise<ReplyTemplateRestoreOutcome> {
  try {
    await deps.restore();
    return "restored";
  } catch (error) {
    const failure = restoreFailure(error);
    if (failure === "gone") {
      void deps.reloadArchived();
      return "gone";
    }
    if (failure === "viewOnly") return "viewOnly";
    if (failure !== "noResponse" && failure !== "serverError") return "failed";
    const check = await checkStillListed(deps.reloadArchived, id);
    if (check === "unsure") return "unsure";
    return check === "stillListed" ? "stillArchived" : "restored";
  }
}
