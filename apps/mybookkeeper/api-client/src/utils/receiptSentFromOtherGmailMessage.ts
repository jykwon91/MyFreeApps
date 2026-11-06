/** What to say about a receipt stuck mid-send on a Gmail account that isn't connected any more. */
export function receiptSentFromOtherGmailMessage(address: string): string {
  return (
    `This receipt may already have gone out from ${address}, which isn't connected any more, so I can't check ` +
    "whether your tenant got it and I didn't send it again. If they got it, dismiss it. If not, reconnect that account and send it again."
  );
}
