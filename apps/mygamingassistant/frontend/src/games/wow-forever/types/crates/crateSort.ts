import type { CrateSortKey } from "@/games/wow-forever/types/crates/crateSortKey";
import type { ProfessionSort } from "@/games/wow-forever/types/professionTiers/professionSort";

export type CrateSort = ProfessionSort<CrateSortKey>;
