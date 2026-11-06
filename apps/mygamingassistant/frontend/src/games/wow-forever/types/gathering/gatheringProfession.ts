/** Gathering professions — each one has a `GatheringGuide` and the `GatheringGuideView`. */
export const GATHERING_PROFESSION = { mining: "mining", herbalism: "herbalism" } as const;
export type GatheringProfession = (typeof GATHERING_PROFESSION)[keyof typeof GATHERING_PROFESSION];
