/** "1 document", "3 documents". Pass the plural when it isn't the singular plus "s". */
export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
