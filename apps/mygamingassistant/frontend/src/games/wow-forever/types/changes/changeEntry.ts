import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";
import type { ChangeKind } from "@/games/wow-forever/types/changes/changeKind";
import type { ChangeRow } from "@/games/wow-forever/types/changes/changeRow";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/** A feed row decoded for the page. */
export interface ChangeEntry {
  key: string;
  category: ChangeCategory;
  kind: ChangeKind;
  name: string;
  summary: string;
  rows: readonly ChangeRow[];
  /** The classes it's for; empty = not class-specific. */
  classes: readonly WowClassId[];
  /** An item's page, so its name can show the item tooltip; null otherwise. */
  itemId: number | null;
  /** Our own page for it; null when there's none. */
  href: string | null;
  icon: WowIcon | null;
  /** Where the Forever side comes from. */
  provenance: ProvenanceTag;
  since: string | null;
  /** Name + summary, normalised for the search box. */
  searchText: string;
}
