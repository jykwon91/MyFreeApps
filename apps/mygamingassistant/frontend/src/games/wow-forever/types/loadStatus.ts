import type { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";

export type LoadStatus = (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS];
