import { useEffect, useId, useState } from "react";
import { Button } from "@platform/ui";
import CraftFormulaChecklist from "@/games/wow-forever/components/crafting/CraftFormulaChecklist";
import CraftPriceField from "@/games/wow-forever/components/crafting/CraftPriceField";
import CraftSlotChecklist from "@/games/wow-forever/components/crafting/CraftSlotChecklist";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import type { EnchantSlot, PriceItem } from "@/games/wow-forever/crafting/cheapestRoute";
import { essencePartner, LESSER_PER_GREATER, type EnteredPrices } from "@/games/wow-forever/crafting/matPrices";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** How long "Undo" stays after a reset to auction prices. */
export const UNDO_MS = 6000;

interface CraftPricesPanelProps {
  items: { main: readonly PriceItem[]; more: readonly PriceItem[] };
  /** Only the prices you typed. */
  overrides: EnteredPrices;
  /** Null while loading, or when the prices didn't load. */
  auction: AuctionPrices | null;
  onPrice: (itemId: number, copper: number | null) => void;
  onReplaceAll: (prices: EnteredPrices) => void;
  /** "Bolts … are priced from the cloth they're made of." */
  selfMadeNote: string;
  formulas: readonly CraftRecipe[];
  knownFormulas: ReadonlySet<number>;
  onFormula: (spell: number, known: boolean) => void;
  /** Enchanting only. */
  slots: { excluded: ReadonlySet<EnchantSlot>; onToggle: (slot: EnchantSlot, allowed: boolean) => void } | null;
  place: CraftPlace;
}

function isOverridden(overrides: EnteredPrices, item: PriceItem): boolean {
  return overrides[String(item.id)] !== undefined;
}

/** "Auction prices for 8 of 9 · 1 set by you", counted over what the default route needs. */
function summaryText(auction: AuctionPrices | null, overrides: EnteredPrices, main: readonly PriceItem[]): string {
  const own = main.filter((i) => isOverridden(overrides, i)).length;
  const ownText = own ? ` · ${own} set by you` : "";
  if (!auction) return `Auction prices not loaded${ownText}`;
  const priced = main.filter((i) => auction.byId.has(i.id)).length;
  return `Auction prices for ${priced} of ${main.length}${ownText}`;
}

/** "3 make 1 Greater Astral Essence" under an essence, since a price for either half counts for both. */
function essenceHint(item: PriceItem, names: ReadonlyMap<number, string>): string | undefined {
  const partner = essencePartner(item.id);
  const other = partner ? names.get(partner.id) : undefined;
  if (!partner || !other) return undefined;
  if (partner.perThis < 1) return `${LESSER_PER_GREATER} make 1 ${other}`;
  return `Splits into ${LESSER_PER_GREATER} ${other}`;
}

/**
 * "Prices": every material at its auction price, with an optional price of
 * your own (say, for what you farm yourself). It also holds the formulas you
 * own and, for Enchanting, the gear you can enchant: everything the cheapest
 * route needs to know. Collapsed to one summary line until opened.
 */
export default function CraftPricesPanel({
  items,
  overrides,
  auction,
  onPrice,
  onReplaceAll,
  selfMadeNote,
  formulas,
  knownFormulas,
  onFormula,
  slots,
  place,
}: CraftPricesPanelProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [undo, setUndo] = useState<EnteredPrices | null>(null);
  const all = [...items.main, ...items.more];
  const names = new Map(all.map((i) => [i.id, i.name]));
  const anyOwn = all.some((i) => isOverridden(overrides, i));

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  function resetPrices(): void {
    // Only this guide's materials. The other profession's prices stay.
    const next: Record<string, number> = { ...overrides };
    for (const item of all) delete next[String(item.id)];
    setUndo(overrides);
    onReplaceAll(next);
  }

  function field(item: PriceItem) {
    return (
      <li key={item.id}>
        <CraftPriceField
          itemId={item.id}
          name={item.name}
          value={overrides[String(item.id)]}
          auction={auction ? { copper: auctionCopper(auction, item.id) } : null}
          onCommit={onPrice}
          hint={essenceHint(item, names)}
        />
      </li>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-2" aria-label="Prices">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[44px] flex flex-col items-start text-left"
      >
        <span className="font-semibold">
          Prices <span aria-hidden>{open ? "▲" : "▼"}</span>
        </span>
        <span className="text-sm text-muted-foreground">{summaryText(auction, overrides, items.main)}</span>
      </button>

      <div id={panelId} hidden={!open} className="space-y-4 pt-1">
        <p className="text-sm text-muted-foreground">
          Each material is priced at the auction house. Type a price of your own only to change one, for example 0 for
          something you farm yourself.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">{items.main.map(field)}</ul>
        <p className="text-xs text-muted-foreground">{selfMadeNote}</p>
        {items.more.length ? (
          <details>
            <summary className="cursor-pointer min-h-[44px] flex items-center text-sm font-medium">
              More materials other recipes use ({items.more.length})
            </summary>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">{items.more.map(field)}</ul>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="link" className="min-h-[44px]" onClick={resetPrices} disabled={!anyOwn}>
            Use auction prices for all
          </Button>
          {undo ? (
            <p className="text-sm flex items-center gap-2" role="status">
              Back to auction prices.
              <Button
                variant="link"
                className="min-h-[44px]"
                onClick={() => {
                  onReplaceAll(undo);
                  setUndo(null);
                }}
              >
                Undo
              </Button>
            </p>
          ) : null}
        </div>

        <CraftFormulaChecklist
          title="Recipes you've bought"
          formulas={formulas}
          known={knownFormulas}
          onToggle={onFormula}
          place={place}
        />
        {slots ? <CraftSlotChecklist excluded={slots.excluded} onToggle={slots.onToggle} /> : null}
      </div>
    </section>
  );
}
