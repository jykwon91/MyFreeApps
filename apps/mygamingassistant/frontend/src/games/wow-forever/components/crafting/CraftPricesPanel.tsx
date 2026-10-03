import { useEffect, useId, useState } from "react";
import { Button } from "@platform/ui";
import CraftFormulaChecklist from "@/games/wow-forever/components/crafting/CraftFormulaChecklist";
import CraftPriceField from "@/games/wow-forever/components/crafting/CraftPriceField";
import CraftSlotChecklist from "@/games/wow-forever/components/crafting/CraftSlotChecklist";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import type { EnchantSlot, PriceItem } from "@/games/wow-forever/crafting/cheapestRoute";
import { essencePartner, LESSER_PER_GREATER, type EnteredPrices } from "@/games/wow-forever/crafting/matPrices";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** How long "Undo" stays after Clear prices. */
export const UNDO_MS = 6000;

interface CraftPricesPanelProps {
  items: { main: readonly PriceItem[]; more: readonly PriceItem[] };
  prices: EnteredPrices;
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

function isSet(prices: EnteredPrices, item: PriceItem): boolean {
  return prices[String(item.id)] !== undefined;
}

/** "Prices: 6 of 9 set" — counted over what the default route needs. */
function summaryText(prices: EnteredPrices, main: readonly PriceItem[], more: readonly PriceItem[]): string {
  const setMain = main.filter((i) => isSet(prices, i)).length;
  if (!setMain && !more.some((i) => isSet(prices, i))) return "Prices: not set";
  return `Prices: ${setMain} of ${main.length} set`;
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
 * "Your prices": what materials cost on your auction house, the formulas you
 * own and (Enchanting) the gear you can enchant — everything the cheapest
 * route needs to know. Collapsed to one summary line until opened.
 */
export default function CraftPricesPanel({
  items,
  prices,
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
  const summary = summaryText(prices, items.main, items.more);
  const anySet = all.some((i) => isSet(prices, i));

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  function clearPrices(): void {
    // Only this guide's materials — the other profession's prices stay.
    const next: Record<string, number> = { ...prices };
    for (const item of all) delete next[String(item.id)];
    setUndo(prices);
    onReplaceAll(next);
  }

  function field(item: PriceItem) {
    return (
      <li key={item.id}>
        <CraftPriceField
          itemId={item.id}
          name={item.name}
          value={prices[String(item.id)]}
          onCommit={onPrice}
          hint={essenceHint(item, names)}
        />
      </li>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-2" aria-label="Your prices">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[44px] flex flex-col items-start text-left"
      >
        <span className="font-semibold">
          Your prices <span aria-hidden>{open ? "▲" : "▼"}</span>
        </span>
        <span className="text-sm text-muted-foreground">{summary}</span>
      </button>
      {anySet ? null : <p className="text-sm">Add your auction house prices to find the cheapest route.</p>}

      <div id={panelId} hidden={!open} className="space-y-4 pt-1">
        <p className="text-sm text-muted-foreground">
          What things cost on your auction house, per item. Leave blank if you don't know.
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
          <Button variant="link" className="min-h-[44px]" onClick={clearPrices} disabled={!anySet}>
            Clear prices
          </Button>
          {undo ? (
            <p className="text-sm flex items-center gap-2" role="status">
              Prices cleared.
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
