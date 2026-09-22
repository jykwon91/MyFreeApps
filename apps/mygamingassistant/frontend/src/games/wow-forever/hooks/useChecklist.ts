import { useCallback, useState } from "react";
import { readStored, removeStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";

export const CHECKLIST_STORAGE_KEY = "mga.wowForever.guide.checklist.v1";

function parseIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((v): v is string => typeof v === "string");
}

/** Checked item ids for the guide's checklist, persisted in localStorage. */
export function useChecklist(validIds: readonly string[]): {
  checked: ReadonlySet<string>;
  toggle: (id: string) => void;
  reset: () => void;
} {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => {
    const stored = readStored(CHECKLIST_STORAGE_KEY, parseIds, []);
    return new Set(stored.filter((id) => validIds.includes(id)));
  });

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored(CHECKLIST_STORAGE_KEY, [...next]);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setChecked(new Set());
    removeStored(CHECKLIST_STORAGE_KEY);
  }, []);

  return { checked, toggle, reset };
}
