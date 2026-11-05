import type { ReplyTemplateWriteOutcome } from "../types/inquiry/reply-template-write-outcome";
import type { ReplyTemplateWriteSteps } from "../types/inquiry/reply-template-write-steps";
import { checkStillListed } from "./checkStillListed";
import { saveFailure } from "./replyTemplateFailure";

/**
 * Archives or restores a template. The server commits before it answers, so a lost
 * answer or a 5xx is settled by reloading the list the template would leave.
 */
export async function settleReplyTemplateWrite(id: string, steps: ReplyTemplateWriteSteps): Promise<ReplyTemplateWriteOutcome> {
  try {
    await steps.write();
    return "done";
  } catch (error) {
    const failure = saveFailure(error);
    if (failure === "gone") {
      void steps.reloadList();
      return "gone";
    }
    if (failure === "viewOnly") return "viewOnly";
    // Neither write sends a name, so a 409 can't mean a taken one.
    if (failure !== "noResponse" && failure !== "serverError") return "failed";
    const check = await checkStillListed(steps.reloadList, id);
    if (check === "unsure") return "unsure";
    if (check === "gone") return "done";
    return failure === "noResponse" ? "unreachable" : "stillListed";
  }
}
