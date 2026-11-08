import type { WowClassId } from "@/games/wow-forever/data/classes";
import { CLASSIC_TALENT_FILES, FOREVER_TALENT_FILES } from "@/games/wow-forever/data/talents/talentFiles";
import { decodeTalentClass } from "@/games/wow-forever/lib/talents/decodeTalentClass";
import type { TalentClassData } from "@/games/wow-forever/types/talents/talentClassData";

const cache = new Map<WowClassId, Promise<TalentClassData>>();

/** One class's talent data, loaded once per page visit; a failed load is forgotten so a retry fetches again. */
export function loadTalentClass(classId: WowClassId): Promise<TalentClassData> {
  const cached = cache.get(classId);
  if (cached) return cached;
  const forever = FOREVER_TALENT_FILES[`./${classId}.json`];
  const classic = CLASSIC_TALENT_FILES[`./classic/${classId}.json`];
  if (!forever || !classic) return Promise.reject(new Error(`no talent data for ${classId}`));
  const loading = Promise.all([forever(), classic()]).then(([file, classicFile]) =>
    decodeTalentClass(classId, file, classicFile),
  );
  cache.set(classId, loading);
  loading.catch(() => cache.delete(classId));
  return loading;
}
