import type { BeastSort } from "@/games/wow-forever/types/hunterPets/beastSort";

/** The Hunter pets page's choices, all in the URL. */
export interface BeastFilters {
  /** A family's slug; null = every family. */
  family: string | null;
  query: string;
  sort: BeastSort;
}
