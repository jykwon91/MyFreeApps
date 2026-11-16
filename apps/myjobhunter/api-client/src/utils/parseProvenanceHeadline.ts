/** The warning over flagged parse lines, e.g. "2 items contain figures or names not found in your uploaded resume…". */
export function parseProvenanceHeadline(count: number): string {
  const items = count === 1 ? "item contains" : "items contain";
  return `${count} ${items} figures or names not found in your uploaded resume — review your Profile before refining.`;
}
