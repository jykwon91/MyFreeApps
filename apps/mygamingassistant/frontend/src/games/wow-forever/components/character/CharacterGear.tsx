import CharacterRender from "@/games/wow-forever/components/character/CharacterRender";
import CharacterSlotList from "@/games/wow-forever/components/character/CharacterSlotList";
import { PAPER_DOLL_LEFT, PAPER_DOLL_RIGHT, PAPER_DOLL_WEAPONS } from "@/games/wow-forever/data/character/characterConfig";
import { itemsBySlot } from "@/games/wow-forever/lib/character/characterGear";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/**
 * The game's character pane: armour down the left and right, the picture in
 * the middle, weapons along the bottom. On a phone the picture comes first,
 * then every slot in the same order.
 */
export default function CharacterGear({ character }: { character: CharacterResponse }) {
  const bySlot = itemsBySlot(character.items);
  const name = `${character.name} ${character.surname}`;
  return (
    <section aria-label="Equipped gear" className="space-y-3">
      <h2 className="text-lg font-semibold">Gear</h2>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem_minmax(0,1fr)]">
        <div className="lg:order-2">
          <CharacterRender slug={character.slug} name={name} hasRender={character.has_render} />
        </div>
        <CharacterSlotList slots={PAPER_DOLL_LEFT} bySlot={bySlot} className="lg:order-1" label="Left side" />
        <CharacterSlotList slots={PAPER_DOLL_RIGHT} bySlot={bySlot} className="lg:order-3" label="Right side" />
      </div>
      <CharacterSlotList slots={PAPER_DOLL_WEAPONS} bySlot={bySlot} className="sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 lg:grid-cols-3" label="Weapons" />
      <p className="text-xs text-muted-foreground">
        Stats are the ones each item rolled, from Blizzard. Tap an item for its full tooltip.
      </p>
    </section>
  );
}
