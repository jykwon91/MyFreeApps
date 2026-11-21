import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { useMemo, useState } from "react";
import { useMediaQuery } from "@platform/ui";
import { useGetCharacterQuery } from "@/games/wow-forever/api/wowCharacterApi";
import AuctionGearFor from "@/games/wow-forever/components/auctionHouse/AuctionGearFor";
import AuctionActiveFilters from "@/games/wow-forever/components/auctionHouse/AuctionActiveFilters";
import AuctionFilterPanel from "@/games/wow-forever/components/auctionHouse/AuctionFilterPanel";
import AuctionFilterSheet from "@/games/wow-forever/components/auctionHouse/AuctionFilterSheet";
import AuctionLookupList from "@/games/wow-forever/components/auctionHouse/AuctionLookupList";
import AuctionSearchControls from "@/games/wow-forever/components/auctionHouse/AuctionSearchControls";
import { AUCTION_WIDE_QUERY } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import { findClass } from "@/games/wow-forever/data/classes";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { useAuctionBisPicks } from "@/games/wow-forever/hooks/useAuctionBisPicks";
import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";
import { useItemCategories } from "@/games/wow-forever/hooks/useItemCategories";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useVerdictScoring } from "@/games/wow-forever/hooks/useVerdictScoring";
import { categoryFilterActive, describeActiveFilters, gearFilterActive, removalPatch } from "@/games/wow-forever/lib/auctionHouse/auctionActiveFilters";
import { bisLevelFor } from "@/games/wow-forever/lib/auctionHouse/bisLevel";
import { gearClassFor } from "@/games/wow-forever/lib/auctionHouse/gearClass";
import { bisTarget } from "@/games/wow-forever/lib/auctionHouse/bisTarget";
import { savedGearSpec } from "@/games/wow-forever/lib/auctionHouse/savedGearSpec";
import { auctionResultsKey } from "@/games/wow-forever/lib/auctionHouse/auctionResultsKey";
import { lookupAuctionItems } from "@/games/wow-forever/lib/auctionHouse/auctionLookup";
import { buildUpgradeMap, sortByUpgrade } from "@/games/wow-forever/lib/auctionHouse/auctionUpgrade";
import { itemQuality } from "@/games/wow-forever/lib/icons/wowIcons";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

interface AuctionLookupProps {
  house: PriceFaction;
  filters: AuctionFilters;
  onFilters: (patch: Partial<AuctionFilters>) => void;
  onClear: () => void;
  /** A profession's materials (item id -> name); null = every item on the house. */
  materials: ReadonlyMap<number, string> | null;
  professionLabel: string | null;
}

/** Search, order, filters and the list of items on one auction house. */
export default function AuctionLookup({ house, filters, onFilters, onClear, materials, professionLabel }: AuctionLookupProps) {
  const [player] = usePlayerSettings();
  const wide = useMediaQuery(AUCTION_WIDE_QUERY);
  const [panelOpen, setPanelOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(() => gearFilterActive(filters));
  // The ~600 KB item list is fetched once the gear group is opened, a gear filter is on,
  // or a character is set (the upgrade column needs item stats).
  const gear = useClientItems(gearOpen || gearFilterActive(filters) || player.characterSlug !== null);
  // The item categories are fetched only once a category is picked (or a link already has one).
  const categories = useItemCategories(categoryFilterActive(filters));
  const priceState = useAuctionPrices(house);
  // The top picks are worked out from the item list and gear data, and only once the filter is on.
  const bisLevel = bisLevelFor(filters, player.level);
  // The class picked on the page, else the player's own: what "usable" and the top picks mean.
  const gearClass = gearClassFor(filters, player.classId);
  const specId = useMemo(() => savedGearSpec(gearClass), [gearClass]);
  const bis = useAuctionBisPicks(filters.bis !== null, gearClass, specId, player.faction, bisLevel);

  // The saved character's gear, for the upgrade column. RTK Query caches this so it's shared
  // with the hover tooltip — no duplicate fetch when the user has already hovered an item.
  const { data: characterData } = useGetCharacterQuery(player.characterSlug ?? "", {
    skip: player.characterSlug === null,
  });
  const character = characterData && characterData.slug === player.characterSlug ? characterData : undefined;
  const scoring = useVerdictScoring(character, gear);

  const classLabel = findClass(gearClass)?.name ?? gearClass;
  const categoriesIndex = categories.status === LOAD_STATUS.ready ? categories.index : null;
  const active = describeActiveFilters(filters, classLabel, categoriesIndex, bisTarget(bisLevel, gearClass, specId));
  const gearById = gear.status === LOAD_STATUS.ready ? gear.list.byId : null;
  const bisPicks = bis.status === LOAD_STATUS.ready ? bis.picks : null;
  const context = useMemo(
    () => ({ qualityOf: itemQuality, gear: gearById, categories: categoriesIndex, bisPicks, classId: gearClass }),
    [gearById, categoriesIndex, bisPicks, gearClass],
  );
  const { prices } = priceState;
  const lookup = useMemo(() => (prices ? lookupAuctionItems(prices.byId, materials, filters, context) : null), [prices, materials, filters, context]);

  // Build the per-row upgrade map once the character and item list are both ready.
  const upgradeMap = useMemo(() => {
    if (!character || !gearById) return null;
    return buildUpgradeMap(lookup?.items ?? [], character, gearById, scoring);
  }, [character, gearById, lookup, scoring]);

  // Apply upgrade sort externally (auctionLookup skips it since it lacks character data).
  const sortedLookup = useMemo(() => {
    if (!lookup || filters.colSort !== "upgrade" || !upgradeMap) return lookup;
    return { ...lookup, items: sortByUpgrade(lookup.items, upgradeMap, filters.colDir) };
  }, [lookup, upgradeMap, filters.colSort, filters.colDir]);

  const gearPending = gearFilterActive(filters) && gear.status !== LOAD_STATUS.ready;
  const categoryPending = categoryFilterActive(filters) && categories.status !== LOAD_STATUS.ready;
  const bisPending = filters.bis !== null && bis.status !== LOAD_STATUS.ready;
  const resultCount = sortedLookup && !gearPending && !categoryPending && !bisPending ? sortedLookup.items.length : null;

  const panel = (
    <AuctionFilterPanel
      filters={filters}
      onFilters={onFilters}
      categories={categories}
      gear={gear}
      gearOpen={gearOpen}
      onToggleGear={() => setGearOpen((open) => !open)}
    />
  );

  return (
    <div className="space-y-4">
      <AuctionSearchControls
        query={filters.query}
        onQuery={(query) => onFilters({ query })}
        sort={filters.sort}
        onSort={(sort) => onFilters({ sort })}
        filterCount={active.length}
        filtersOpen={panelOpen}
        onToggleFilters={() => setPanelOpen((open) => !open)}
      />
      <AuctionGearFor filters={filters} onFilters={onFilters} playerClass={player.classId} classLabel={classLabel} bisLevel={bisLevel} playerLevel={bisLevelFor({ bisLevel: null }, player.level)} />
      {wide && panelOpen && <div className="rounded-xl border bg-card p-4">{panel}</div>}
      {!wide && panelOpen && (
        <AuctionFilterSheet onClose={() => setPanelOpen(false)} resultCount={resultCount} canClear={active.length > 0} onClear={onClear}>
          {panel}
        </AuctionFilterSheet>
      )}
      <AuctionActiveFilters active={active} onRemove={(group) => onFilters(removalPatch(group))} onClear={onClear} />
      <AuctionLookupList
        priceState={priceState}
        gear={gear}
        categories={categories}
        bis={bis}
        filters={filters}
        active={active}
        lookup={sortedLookup}
        resultsKey={auctionResultsKey(house, professionLabel, filters)}
        professionLabel={professionLabel}
        onClear={onClear}
        onColSort={(colSort, colDir) => onFilters({ colSort, colDir })}
        upgradeMap={upgradeMap}
      />
    </div>
  );
}
