/** How a zone's level range fits the player's level ("Where to level"). */
export const ZONE_FIT = { right: "right", tooLow: "too_low", tooHigh: "too_high" } as const;
export type ZoneFit = (typeof ZONE_FIT)[keyof typeof ZONE_FIT];
