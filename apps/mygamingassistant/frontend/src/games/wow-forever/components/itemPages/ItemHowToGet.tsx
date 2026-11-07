import FoodContainerList from "@/games/wow-forever/components/food/detail/FoodContainerList";
import FoodVendorList from "@/games/wow-forever/components/food/detail/FoodVendorList";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import CraftedByList from "@/games/wow-forever/components/itemPages/CraftedByList";
import InstanceDropList from "@/games/wow-forever/components/itemPages/InstanceDropList";
import ItemDropSection from "@/games/wow-forever/components/itemPages/ItemDropSection";
import ItemQuestList from "@/games/wow-forever/components/itemPages/ItemQuestList";
import ItemSourceSection from "@/games/wow-forever/components/itemPages/ItemSourceSection";
import { questsFor } from "@/games/wow-forever/food/recipeSources";
import { RAID_NOTE } from "@/games/wow-forever/lib/itemPages/describeItem";
import { noSourceText } from "@/games/wow-forever/lib/itemPages/noSourceText";
import { itemSectionProvenance } from "@/games/wow-forever/lib/provenance/itemSectionProvenance";
import {
  ITEM_SOURCE_SECTION,
  itemSourceSections,
  splitInstanceDrops,
  type ItemSourceSection as SectionKind,
} from "@/games/wow-forever/lib/itemPages/itemSourceSections";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import type { ItemPage } from "@/games/wow-forever/types/itemPages/itemPage";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ItemHowToGetProps {
  page: ItemPage;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

const TITLES: Readonly<Record<SectionKind, string>> = {
  [ITEM_SOURCE_SECTION.vendor]: "Sold by",
  [ITEM_SOURCE_SECTION.quest]: "Quest reward",
  [ITEM_SOURCE_SECTION.dungeon]: "Dungeon drop",
  [ITEM_SOURCE_SECTION.crafted]: "Crafted",
  [ITEM_SOURCE_SECTION.drop]: "Drops in the open world",
  [ITEM_SOURCE_SECTION.container]: "Found in",
  [ITEM_SOURCE_SECTION.raid]: "Raid drop",
};

/** "How to get it": every known source, most practical first. */
export default function ItemHowToGet({ page, faction, zoneId, level }: ItemHowToGetProps) {
  const { sources, quests, instanceDrops, moreInstanceDrops } = page.sources;
  const { dungeon, raid } = splitInstanceDrops(instanceDrops);
  const yours = questsFor(quests, faction);
  const other = faction === FACTION.alliance ? FACTION.horde : FACTION.alliance;
  const sections = itemSourceSections(page, faction);

  function body(section: SectionKind) {
    switch (section) {
      case ITEM_SOURCE_SECTION.vendor:
        return <FoodVendorList vendors={sources.vendors} faction={faction} zoneId={zoneId} />;
      case ITEM_SOURCE_SECTION.quest:
        return yours.length ? (
          <ItemQuestList quests={yours} otherFaction={null} />
        ) : (
          <ItemQuestList quests={quests} otherFaction={other} />
        );
      case ITEM_SOURCE_SECTION.dungeon:
        return <InstanceDropList drops={dungeon} more={raid.length ? 0 : moreInstanceDrops} note="" />;
      case ITEM_SOURCE_SECTION.crafted:
        return <CraftedByList crafted={page.facts.crafted} />;
      case ITEM_SOURCE_SECTION.drop:
        return sources.drop ? <ItemDropSection drop={sources.drop} faction={faction} level={level} /> : null;
      case ITEM_SOURCE_SECTION.container:
        return <FoodContainerList sources={sources} faction={faction} zoneId={zoneId} level={level} />;
      case ITEM_SOURCE_SECTION.raid:
        return <InstanceDropList drops={raid} more={moreInstanceDrops} note={RAID_NOTE} />;
    }
  }

  return (
    <section className={DETAIL_SECTION} aria-labelledby="how-to-get-it">
      <h2 id="how-to-get-it" className="text-lg font-semibold">
        How to get it
      </h2>
      {sections.length ? (
        sections.map((section) => (
          <ItemSourceSection key={section} title={TITLES[section]} provenance={itemSectionProvenance(section)}>
            {body(section)}
          </ItemSourceSection>
        ))
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="item-no-sources">
          {noSourceText(page.item.id)}
        </p>
      )}
    </section>
  );
}
