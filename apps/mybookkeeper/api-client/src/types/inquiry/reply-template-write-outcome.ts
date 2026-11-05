/**
 * How an archive or restore ended, once a lost answer or a 5xx has been settled
 * by reloading the list the template would leave. `gone` is a 404: no template with
 * that id is in the list it was taken from. `unreachable` is a lost answer and `stillListed` a server error,
 * each with the template still in the list.
 */
export type ReplyTemplateWriteOutcome = "done" | "gone" | "viewOnly" | "unreachable" | "stillListed" | "unsure" | "failed";
