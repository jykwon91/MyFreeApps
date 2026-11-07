export function filtersToggleLabel(activeCount: number): string {
  return activeCount > 0 ? `Filters, ${activeCount} on` : "Filters";
}
