import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import type { ReplyTemplateWriteCheck } from "../../types/ReplyTemplateWriteCheck";

type Reload = () => Promise<{ isSuccess: boolean; data?: ReplyTemplate[] }>;

/** The server commits before it answers, so a lost answer is settled by reloading the list it would leave. */
export async function checkStillListed(reload: Reload, id: string): Promise<ReplyTemplateWriteCheck> {
  const latest = await reload();
  if (!latest.isSuccess || !latest.data) return "unsure";
  return latest.data.some((template) => template.id === id) ? "stillListed" : "gone";
}
