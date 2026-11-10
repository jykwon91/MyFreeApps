/** Why a material's price is under pressure from crafting, as the MGA Prices tooltip says it. */
export interface ReagentDemand {
  /** A vendor always sells it, so crafting can't push its price far: the tooltip says only that. */
  vendor: boolean;
  /** The leveling routes that use it, e.g. "Tailoring 1–75, First Aid 1–80 +1 more"; "" when none. */
  leveling: string;
  /** How many recipes use it. */
  recipes: number;
  /** The professions those recipes belong to, e.g. "Tailoring, Leatherworking". */
  professions: string;
}
