import type { RACIAL_STATUS } from "@/games/wow-forever/data/races/racesConfig";

/** How a racial in Forever compares with Classic Era's. */
export type RacialStatus = (typeof RACIAL_STATUS)[keyof typeof RACIAL_STATUS];
