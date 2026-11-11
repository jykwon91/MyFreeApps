/** The list with each new entry added once, trimmed, leaving out blanks and any already in it whatever their case. */
export function addChipValues(current: readonly string[], additions: readonly string[]): string[] {
  const next = [...current];
  for (const addition of additions) {
    const value = addition.trim();
    if (value && !next.some((existing) => existing.toLowerCase() === value.toLowerCase())) next.push(value);
  }
  return next;
}
