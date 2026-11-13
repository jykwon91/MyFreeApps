/**
 * Scrolls a sideways-scrolling row just enough to centre `item` when any of it
 * is out of view; leaves the page's own scroll alone.
 */
export function scrollIntoRow(row: HTMLElement, item: HTMLElement): void {
  const rowBox = row.getBoundingClientRect();
  const itemBox = item.getBoundingClientRect();
  if (itemBox.left >= rowBox.left && itemBox.right <= rowBox.right) return;
  const left = itemBox.left - rowBox.left + row.scrollLeft;
  row.scrollLeft = left - (row.clientWidth - itemBox.width) / 2;
}
