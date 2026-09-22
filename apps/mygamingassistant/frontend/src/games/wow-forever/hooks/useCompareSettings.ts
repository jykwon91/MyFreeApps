import { useCallback, useState } from "react";
import { findClass, findSpec, LEVELING_SPEC_ID } from "@/games/wow-forever/data/classes";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CompareSettings } from "@/games/wow-forever/types/compareSettings";

export const COMPARE_SETTINGS_STORAGE_KEY = "mga.wowForever.compare.settings.v1";

export const DEFAULT_COMPARE_SETTINGS: CompareSettings = {
  classId: "mage",
  specId: LEVELING_SPEC_ID,
  bracket: "leveling",
  currentHitPct: null,
};

const BRACKETS: readonly WeightBracket[] = ["leveling", "level60"];

/** Accept a stored value only if every field is still valid. */
export function parseCompareSettings(raw: unknown): CompareSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const cls = typeof r.classId === "string" ? findClass(r.classId) : undefined;
  if (!cls || typeof r.specId !== "string") return null;
  const specOk = r.specId === LEVELING_SPEC_ID || findSpec(cls.id, r.specId) !== undefined;
  const bracket = BRACKETS.find((b) => b === r.bracket);
  if (!specOk || !bracket) return null;
  let currentHitPct: number | null = null;
  if (typeof r.currentHitPct === "number" && Number.isFinite(r.currentHitPct)) currentHitPct = r.currentHitPct;
  return { classId: cls.id, specId: r.specId, bracket, currentHitPct };
}

export function useCompareSettings(): [CompareSettings, (patch: Partial<CompareSettings>) => void] {
  const [settings, setSettings] = useState<CompareSettings>(() =>
    readStored(COMPARE_SETTINGS_STORAGE_KEY, parseCompareSettings, DEFAULT_COMPARE_SETTINGS),
  );

  const update = useCallback((patch: Partial<CompareSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Changing class resets the spec — spec ids are only unique within a class.
      if (patch.classId && patch.classId !== prev.classId && patch.specId === undefined) {
        next.specId = LEVELING_SPEC_ID;
      }
      writeStored(COMPARE_SETTINGS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return [settings, update];
}
