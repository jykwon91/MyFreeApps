import type { ReplyTemplateWriteCheck } from "../types/inquiry/reply-template-write-check";
import type { ReplyTemplateWriteSteps } from "../types/inquiry/reply-template-write-steps";

/** The server commits before it answers, so a lost answer is settled by reloading the list it would leave. */
export async function checkStillListed(reload: ReplyTemplateWriteSteps["reloadList"], id: string): Promise<ReplyTemplateWriteCheck> {
  const latest = await reload();
  if (!latest.isSuccess || !latest.data) return "unsure";
  return latest.data.some((template) => template.id === id) ? "stillListed" : "gone";
}
