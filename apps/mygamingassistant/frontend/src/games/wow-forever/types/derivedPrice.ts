/**
 * A price worked out from other prices, never read off the auction house.
 * `essence` = the other half of its essence pair converted (3 Lesser = 1
 * Greater); `materials` = the reagents of the recipe that makes it.
 */
export type DerivedPrice = { copper: number; from: "essence"; partner: number } | { copper: number; from: "materials" };
