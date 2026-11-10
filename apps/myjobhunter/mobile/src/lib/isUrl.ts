/** Whether text is a web address that can be opened, rather than a place name. */
export function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
