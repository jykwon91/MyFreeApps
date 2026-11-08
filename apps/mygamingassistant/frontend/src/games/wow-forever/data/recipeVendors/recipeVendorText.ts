/** The professions page's "Recipe vendors" section: its anchor, title and fixed copy. */
export const RECIPE_VENDORS_SECTION = {
  id: "vendors",
  title: "Recipe vendors",
  navLabel: "Recipe vendors",
  intro: "Every recipe a vendor sells, grouped by vendor so one trip buys them all. Route recipes come first.",
} as const;

/** Under every price: these are Classic list prices. */
export const PRICE_NOTE = "Prices are Classic list prices, before any reputation discount.";

/** Shown when distances can't be measured; links to the World Map. */
export const SET_LOCATION_PROMPT = {
  lead: "Set your location on the",
  link: "World Map",
  tail: "to sort vendors by distance (as the crow flies).",
  href: "/wow-forever/map",
} as const;

/** Fixed lines in the section and on vendor cards. */
export const RECIPE_VENDOR_TEXT = {
  noVendors: "No vendor sells a recipe for this profession in the Classic data.",
  cookingLoadError: "Couldn't load the Cooking recipe vendors.",
  neutral: "Neutral, both factions",
  otherContinent: "Another continent — boat or zeppelin",
} as const;

/** Vendor groups shown before "Show all". */
export const FIRST_VENDOR_GROUPS = 6;
