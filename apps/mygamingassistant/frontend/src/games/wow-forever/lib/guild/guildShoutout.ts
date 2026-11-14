/** "Level 44 Druid"; leaves out what Blizzard gave no value for. */
export function shoutoutDetail(level: number | null, className: string | null): string {
  const parts: string[] = [];
  if (level !== null) parts.push(`Level ${level}`);
  if (className) parts.push(className);
  return parts.join(" ");
}
