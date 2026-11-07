import { useCallback } from "react";
import { useLiveSearchParams } from "@/games/wow-forever/hooks/useLiveSearchParams";
import { parseSpec } from "@/games/wow-forever/crafting/craftSpecs";
import { CRAFTING_SPECS } from "@/games/wow-forever/data/professions/crafting/craftingSpecs";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

export const CRAFT_SPEC_STORAGE_KEY = "mga.wowForever.professions.spec.v1";
export const SPEC_PARAM = "spec";

type StoredSpecs = Partial<Record<CraftingProfession, string>>;

/** Saved choices; a value the profession doesn't have (renamed, or another profession's) is dropped. */
function parseStored(raw: unknown): StoredSpecs | null {
  if (typeof raw !== "object" || raw === null) return null;
  const out: StoredSpecs = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isCraftingProfession(key)) continue;
    const spec = parseSpec(CRAFTING_SPECS[key], value);
    if (spec !== null) out[key] = spec;
  }
  return out;
}

/**
 * Your specialization in a crafting profession (null = not chosen yet). A
 * `?spec=` link wins for that visit; choosing saves it per profession.
 */
export function useCraftingSpec(profession: CraftingProfession): [string | null, (spec: string | null) => void] {
  const [params, setParams] = useLiveSearchParams();
  const specs = CRAFTING_SPECS[profession];
  const fromUrl = parseSpec(specs, params.get(SPEC_PARAM));
  const spec = fromUrl ?? readStored(CRAFT_SPEC_STORAGE_KEY, parseStored, {})[profession] ?? null;

  const update = useCallback(
    (next: string | null) => {
      const value = parseSpec(CRAFTING_SPECS[profession], next);
      const stored = { ...readStored(CRAFT_SPEC_STORAGE_KEY, parseStored, {}) };
      if (value === null) delete stored[profession];
      else stored[profession] = value;
      writeStored(CRAFT_SPEC_STORAGE_KEY, stored);
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (value === null) out.delete(SPEC_PARAM);
          else out.set(SPEC_PARAM, value);
          return out;
        },
        { replace: true },
      );
    },
    [profession, setParams],
  );

  return [specs ? spec : null, update];
}
