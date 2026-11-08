/** The spellbook's filters, as the URL holds them. */
export interface SpellbookFilters {
  /** A spell tab's skill line id, or null for every tab. */
  tab: number | null;
  /** Only spells Forever changed from Classic or added. */
  differentOnly: boolean;
  query: string;
  /** Only spells with a rank learnable at or below this level. */
  level: number | null;
}
