/** Secondary professions with the Cooking / Fishing guide view (`SecondaryGuideView`). */
export const SECONDARY_PROFESSION = { cooking: "cooking", fishing: "fishing" } as const;
export type SecondaryProfession = (typeof SECONDARY_PROFESSION)[keyof typeof SECONDARY_PROFESSION];
