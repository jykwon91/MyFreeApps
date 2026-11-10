import { fireEvent, screen, within } from "@testing-library/react";

type AriaSort = "ascending" | "descending";

/** Clicks a DataTable column's sort button until the column sorts the given way. */
export function sortTableBy(columnName: RegExp, direction: AriaSort): void {
  for (let clicks = 0; clicks < 3; clicks++) {
    const header = screen.getByRole("columnheader", { name: columnName });
    if (header.getAttribute("aria-sort") === direction) return;
    fireEvent.click(within(header).getByRole("button"));
  }
  throw new Error(`Column ${String(columnName)} never sorted ${direction}`);
}

/**
 * The text of one column for every body row, top to bottom. Rows are read from
 * <tbody> because a clickable DataTable row takes role="button", not "row".
 */
export function columnValues(columnIndex: number): string[] {
  const bodyRows = Array.from(screen.getByRole("table").querySelectorAll<HTMLTableRowElement>("tbody tr"));
  return bodyRows.map((row) => within(row).getAllByRole("cell")[columnIndex]?.textContent ?? "");
}
