/** The id of one tab in a tab row, so its panel can name it. Pure. */
export function tabId(prefix: string, tab: string): string {
  return `${prefix}-tab-${tab}`;
}

/** The id of a tab row's panel, so each tab can point at it. Pure. */
export function tabPanelId(prefix: string): string {
  return `${prefix}-panel`;
}
