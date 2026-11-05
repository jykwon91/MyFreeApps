import type { UtilityCostsPreset } from "../types/UtilityCostsPreset";

export const UTILITY_COSTS_PRESETS: readonly { value: UtilityCostsPreset; label: string }[] = [
  { value: "last12", label: "Last 12 months" },
  { value: "thisYear", label: "This year" },
  { value: "lastYear", label: "Last year" },
];

export const ALL_PROPERTIES = "all";

export const UTILITY_COSTS_SKELETON_UTILITIES = [0, 1, 2, 3] as const;
export const UTILITY_COSTS_SKELETON_MONTHS = [0, 1, 2, 3, 4, 5] as const;

export const UTILITY_LABELS: Readonly<Record<string, string>> = {
  electricity: "Electricity",
  water: "Water",
  gas: "Gas",
  internet: "Internet",
  trash: "Trash",
  sewer: "Sewer",
  other: "Other utilities",
};

export const UTILITY_COSTS_MESSAGES = {
  loading: "Loading your utility costs",
  rangeLabel: "Time range",
  property: "Property",
  propertyHint: "Choose which property's bills to count",
  allProperties: "All properties",
  propertiesFailed: "I couldn't load your properties, so I'm counting all of them. Pull down to try again.",
  approvedOnly: "I only count bills you've approved.",
  byUtility: "By utility",
  byMonth: "By month",
  soFar: "so far",
  noBills: "No bills",
  couldntLoad: "I couldn't load your utility costs. Want me to try again?",
  checkConnection: "It might be the connection, or I might need a minute.",
  tryAgain: "Try again",
  noneHeading: "I haven't found any approved utility bills in the last 12 months",
  noneBodyWriter: "I only count bills you've approved, so check anything waiting for review. Or snap a new one and I'll track it here.",
  noneBodyViewer: "They'll show up here once someone adds and approves one.",
  takePhoto: "Take a photo",
  noneInRangeHeading: "I don't see any approved utility bills in this range",
  noneInRangeBody: "They might be in a different range, under another property, or still waiting for your approval.",
  showDefault: "Show all properties for the last 12 months",
} as const;
