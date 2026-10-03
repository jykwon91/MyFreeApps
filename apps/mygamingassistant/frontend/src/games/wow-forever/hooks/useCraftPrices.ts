import { useCallback, useMemo, useState } from "react";
import { ENCHANT_SLOTS, type EnchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";
import { MAX_PRICE_COPPER, type EnteredPrices } from "@/games/wow-forever/crafting/matPrices";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

/** Prices are per item and items rarely overlap between professions, so one map serves both. */
export const PRICES_STORAGE_KEY = "mga.wowForever.professions.prices.v1";
export const KNOWN_RECIPES_STORAGE_KEY = "mga.wowForever.professions.knownRecipes.v1";
export const ENCHANT_SLOTS_STORAGE_KEY = "mga.wowForever.professions.enchantSlots.v1";

function isObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

export function parseStoredPrices(raw: unknown): EnteredPrices | null {
  if (!isObject(raw)) return null;
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!/^\d+$/.test(id) || typeof value !== "number" || !Number.isInteger(value)) continue;
    if (value < 0 || value > MAX_PRICE_COPPER) continue;
    out[id] = value;
  }
  return out;
}

type StoredRecipes = Partial<Record<CraftingProfession, number[]>>;

function parseStoredRecipes(raw: unknown): StoredRecipes | null {
  if (!isObject(raw)) return null;
  const out: StoredRecipes = {};
  for (const key of ["tailoring", "enchanting"] as const) {
    const list = raw[key];
    if (Array.isArray(list)) out[key] = list.filter((n): n is number => Number.isInteger(n) && n > 0);
  }
  return out;
}

/** Stored as the slots you *can't* enchant, so every slot is ticked until you untick it. */
function parseStoredSlots(raw: unknown): EnchantSlot[] | null {
  if (!isObject(raw) || !Array.isArray(raw.excluded)) return null;
  return ENCHANT_SLOTS.filter((slot) => (raw.excluded as unknown[]).includes(slot));
}

export interface MatPrices {
  prices: EnteredPrices;
  /** Null clears that item's price. */
  setPrice: (itemId: number, copper: number | null) => void;
  /** Replace every price at once (clear, and undo the clear). */
  replaceAll: (prices: EnteredPrices) => void;
}

/** Your auction house prices, saved on this device. Never throws without storage — they just won't persist. */
export function useMatPrices(): MatPrices {
  const [prices, setPrices] = useState<EnteredPrices>(() => readStored(PRICES_STORAGE_KEY, parseStoredPrices, {}));

  const replaceAll = useCallback((next: EnteredPrices) => {
    writeStored(PRICES_STORAGE_KEY, next);
    setPrices(next);
  }, []);

  const setPrice = useCallback((itemId: number, copper: number | null) => {
    setPrices((prev) => {
      const next = { ...prev };
      if (copper === null) delete next[String(itemId)];
      else next[String(itemId)] = copper;
      writeStored(PRICES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { prices, setPrice, replaceAll };
}

/** The formulas (item-learned recipes) you've bought for one profession. */
export function useKnownRecipes(profession: CraftingProfession): [ReadonlySet<number>, (spell: number, known: boolean) => void] {
  const [stored, setStored] = useState<StoredRecipes>(() => readStored(KNOWN_RECIPES_STORAGE_KEY, parseStoredRecipes, {}));
  const known = useMemo(() => new Set(stored[profession] ?? []), [stored, profession]);

  const toggle = useCallback(
    (spell: number, isKnown: boolean) => {
      setStored((prev) => {
        const list = new Set(prev[profession] ?? []);
        if (isKnown) list.add(spell);
        else list.delete(spell);
        const next = { ...prev, [profession]: [...list].sort((a, b) => a - b) };
        writeStored(KNOWN_RECIPES_STORAGE_KEY, next);
        return next;
      });
    },
    [profession],
  );

  return [known, toggle];
}

/** Gear slots you can't put an enchant on (no shield, no two-hander). */
export function useExcludedSlots(): [ReadonlySet<EnchantSlot>, (slot: EnchantSlot, allowed: boolean) => void] {
  const [excluded, setExcluded] = useState<EnchantSlot[]>(() => readStored(ENCHANT_SLOTS_STORAGE_KEY, parseStoredSlots, []));

  const toggle = useCallback((slot: EnchantSlot, allowed: boolean) => {
    setExcluded((prev) => {
      const without = prev.filter((s) => s !== slot);
      const next = allowed ? without : [...without, slot];
      writeStored(ENCHANT_SLOTS_STORAGE_KEY, { excluded: next });
      return next;
    });
  }, []);

  const set = useMemo(() => new Set(excluded), [excluded]);
  return [set, toggle];
}
