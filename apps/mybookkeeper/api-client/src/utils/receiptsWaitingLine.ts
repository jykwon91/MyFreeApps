/** How many receipts are queued to send, in words: "3 receipts waiting to send". */
export function receiptsWaitingLine(count: number): string {
  return `${count} ${count === 1 ? "receipt" : "receipts"} waiting to send`;
}
