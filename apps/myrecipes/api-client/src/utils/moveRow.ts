/** The rows with the one keyed `key` swapped one place up (-1) or down (1). Unchanged at an end. */
export function moveRow<Row extends { key: string }>(rows: Row[], key: string, direction: -1 | 1): Row[] {
  const index = rows.findIndex((row) => row.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
