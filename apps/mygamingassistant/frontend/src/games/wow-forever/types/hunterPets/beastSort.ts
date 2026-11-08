import type { BEAST_SORT } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";

export type BeastSort = (typeof BEAST_SORT)[keyof typeof BEAST_SORT];
