/** Where the store marks an inquiry whose earlier reply may already be in the inquirer's inbox. */
export function replyMightHaveSentKey(inquiryId: string): string {
  return `${inquiryId}:mightHaveSent`;
}
