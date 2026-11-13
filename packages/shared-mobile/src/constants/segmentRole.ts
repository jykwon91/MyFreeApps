/** How a segmented control reads to a screen reader: tabs that switch a view, or radios that pick a setting. */
export const SEGMENT_ROLE = {
  tab: "tab",
  radio: "radio",
} as const;

export const SEGMENT_GROUP_ROLE = {
  tab: "tablist",
  radio: "radiogroup",
} as const;
