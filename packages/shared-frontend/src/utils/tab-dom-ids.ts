export function tabDomId(idPrefix: string, value: string): string {
  return `${idPrefix}-tab-${value}`;
}

/** The id of the one panel every tab controls, or of one tab's own panel when `perTab` is true. */
export function tabPanelDomId(idPrefix: string, value: string, perTab: boolean): string {
  return perTab ? `${idPrefix}-panel-${value}` : `${idPrefix}-panel`;
}
