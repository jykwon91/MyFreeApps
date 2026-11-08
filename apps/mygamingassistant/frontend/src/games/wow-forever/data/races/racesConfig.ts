/** The races page's fixed values: paths, URL params, labels and texts. */

export const RACES_PAGE_PATH = "/wow-forever/races";

export const RACE_FACTION = { alliance: "alliance", horde: "horde" } as const;
export const RACE_FACTION_ORDER = [RACE_FACTION.alliance, RACE_FACTION.horde] as const;
export const RACE_FACTION_LABEL: Readonly<Record<(typeof RACE_FACTION)[keyof typeof RACE_FACTION], string>> = {
  alliance: "Alliance",
  horde: "Horde",
};

/** The generator's statuses (`scripts/wow_races/racials.py`). */
export const RACIAL_STATUS = { new: "new", changed: "changed", unchanged: "unchanged", removed: "removed" } as const;
export const RACIAL_STATUS_ORDER = [
  RACIAL_STATUS.changed,
  RACIAL_STATUS.new,
  RACIAL_STATUS.removed,
  RACIAL_STATUS.unchanged,
] as const;
export const RACIAL_STATUS_LABEL: Readonly<Record<(typeof RACIAL_STATUS)[keyof typeof RACIAL_STATUS], string>> = {
  new: "New in Forever",
  changed: "Changed in Forever",
  unchanged: "Same as Classic",
  removed: "Removed in Forever",
};

export const RACIAL_KIND = { active: "active", passive: "passive" } as const;
export const RACIAL_KIND_LABEL: Readonly<Record<(typeof RACIAL_KIND)[keyof typeof RACIAL_KIND], string>> = {
  active: "Active",
  passive: "Passive",
};

export const RACE_FACTION_PARAM = "faction";
export const RACE_CLASS_PARAM = "class";
export const RACE_STATUS_PARAM = "status";
export const RACE_CHANGED_PARAM = "changed";
/** The value the yes/no "changed" param takes when on. */
export const RACE_PARAM_ON = "1";

/** Column headings of a changed racial's Classic | Forever comparison. */
export const RACE_COMPARE_COLUMNS = { classic: "Classic Era", forever: "Forever" } as const;

/** Race cards the skeleton draws while the data loads. */
export const RACES_SKELETON_CARDS = 3;
/** Racial rows per skeleton card. */
export const RACES_SKELETON_RACIALS = 3;

export const RACES_TEXT = {
  emptyFiltered: "No racials match these filters.",
  unknownRace: "That race isn't in the game files.",
  unknownValue: "“?” is a number the game files don't include, so it can't be shown or compared.",
  newRace: "New race in Forever",
  newClass: "New in Forever",
  allRaces: "All races",
  showOnMap: "Show on the World Map",
} as const;

/** The races data's load states (`RacesState.status`). */
export const RACES_STATUS = { loading: "loading", ready: "ready", error: "error" } as const;
