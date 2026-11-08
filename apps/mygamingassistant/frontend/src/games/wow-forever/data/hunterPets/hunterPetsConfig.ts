/** The Hunter pets guide's fixed values: paths, URL params, sorts, page sizes and texts. */

export const HUNTER_PETS_PAGE_PATH = "/wow-forever/hunter-pets";

export const BEAST_FAMILY_PARAM = "family";
export const BEAST_QUERY_PARAM = "q";
export const BEAST_SORT_PARAM = "sort";

export const BEAST_SORT = { level: "level", zone: "zone", speed: "speed" } as const;
export const DEFAULT_BEAST_SORT = BEAST_SORT.level;
export const BEAST_SORT_LABEL: Readonly<Record<(typeof BEAST_SORT)[keyof typeof BEAST_SORT], string>> = {
  level: "Level, lowest first",
  zone: "Zone, A to Z",
  speed: "Attack speed, fastest first",
};

/** Beasts shown before "Show more", and added by each press. */
export const BEASTS_PAGE_SIZE = 40;
/** Beasts shown under one ability rank before "Show all". */
export const TEACHERS_PREVIEW = 5;

/** Placeholders the skeleton draws while the data loads. */
export const HUNTER_PETS_SKELETON_FAMILIES = 6;
export const HUNTER_PETS_SKELETON_ROWS = 5;

/** The Hunter pets data's load states (`HunterPetsState.status`). */
export const HUNTER_PETS_STATUS = { loading: "loading", ready: "ready", error: "error" } as const;

export const HUNTER_PETS_EMPTY = {
  noBeasts: "No tamable beasts match these filters.",
  noAbilities: "No abilities match this family.",
  noTeachers: "No tamable Classic beast teaches this rank.",
  teachersUnknown: "Which beasts teach this isn't known yet.",
  beastUnknown: "Level, zone and attack speed aren't known yet.",
} as const;
