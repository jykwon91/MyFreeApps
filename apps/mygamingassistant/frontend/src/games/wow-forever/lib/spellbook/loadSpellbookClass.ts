import type { WowClassId } from "@/games/wow-forever/data/classes";
import { CLASSIC_SPELLBOOK_FILES, FOREVER_SPELLBOOK_FILES } from "@/games/wow-forever/data/spellbook/spellbookFiles";
import { decodeSpellbook } from "@/games/wow-forever/lib/spellbook/decodeSpellbook";
import type { SpellbookClass } from "@/games/wow-forever/types/spellbook/spellbookClass";

const cache = new Map<WowClassId, Promise<SpellbookClass>>();

/** One class's spellbook, loaded once per page visit; a failed load is forgotten so a retry fetches again. */
export function loadSpellbookClass(classId: WowClassId): Promise<SpellbookClass> {
  const cached = cache.get(classId);
  if (cached) return cached;
  const forever = FOREVER_SPELLBOOK_FILES[`./${classId}.json`];
  const classic = CLASSIC_SPELLBOOK_FILES[`./classic/${classId}.json`];
  if (!forever || !classic) return Promise.reject(new Error(`no spellbook data for ${classId}`));
  const loading = Promise.all([forever(), classic()]).then(([file, classicFile]) => decodeSpellbook(file, classicFile));
  cache.set(classId, loading);
  loading.catch(() => cache.delete(classId));
  return loading;
}
