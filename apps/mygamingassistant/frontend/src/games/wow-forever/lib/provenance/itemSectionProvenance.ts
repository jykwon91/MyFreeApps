import { ITEM_SOURCE_SECTION, type ItemSourceSection } from "@/games/wow-forever/lib/itemPages/itemSourceSections";
import { PROVENANCE, type Provenance } from "@/games/wow-forever/types/provenance/provenance";

/** An item page's "How to get it" section: recipes come from the Forever game files, every other section from Classic data. */
export function itemSectionProvenance(section: ItemSourceSection): Provenance {
  return section === ITEM_SOURCE_SECTION.crafted ? PROVENANCE.client : PROVENANCE.classic;
}
