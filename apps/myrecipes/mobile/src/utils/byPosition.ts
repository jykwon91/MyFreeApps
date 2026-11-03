/** A copy in the order the recipe's author wrote them. */
export function byPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}
