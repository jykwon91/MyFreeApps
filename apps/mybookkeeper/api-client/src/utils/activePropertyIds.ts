/**
 * The properties a drill-down should narrow to. Choosing none, or every one, means every property,
 * so there is nothing to narrow by.
 */
export function activePropertyIds(selectedIds: readonly string[], propertyCount: number): string[] | undefined {
  if (selectedIds.length === 0 || selectedIds.length === propertyCount) return undefined;
  return [...selectedIds];
}
