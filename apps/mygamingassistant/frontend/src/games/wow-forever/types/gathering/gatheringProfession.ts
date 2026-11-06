/** Gathering professions — each one has a `GatheringGuide` and the `GatheringGuideView`. Herbalism goes here next. */
export const GATHERING_PROFESSION = { mining: "mining" } as const;
export type GatheringProfession = (typeof GATHERING_PROFESSION)[keyof typeof GATHERING_PROFESSION];
