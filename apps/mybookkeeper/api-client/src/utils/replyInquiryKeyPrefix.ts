/** Every store key for one inquiry's replies starts with this. */
export function replyInquiryKeyPrefix(inquiryId: string): string {
  return `${inquiryId}:`;
}
