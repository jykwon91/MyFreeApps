let count = 0;

/** A key no other editor row has, for list identity. Never sent to the server. */
export function nextRowKey(): string {
  count += 1;
  return `row-${count}`;
}
