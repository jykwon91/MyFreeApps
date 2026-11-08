import { CHANGE_INDEX, CHANGE_SHARD_FILES } from "@/games/wow-forever/data/changes/changeFiles";
import { decodeChangeEntry } from "@/games/wow-forever/lib/changes/decodeChangeEntry";
import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";

const cache = new Map<ChangeCategory, Promise<readonly ChangeEntry[]>>();

/** One category's rows (its shards, decoded), loaded once per visit; a failed load is forgotten so a retry fetches again. */
export function loadChangeCategory(category: ChangeCategory): Promise<readonly ChangeEntry[]> {
  const cached = cache.get(category);
  if (cached) return cached;
  const loaders = CHANGE_INDEX.shards[category].map((path) => CHANGE_SHARD_FILES[`./${path}`]);
  if (loaders.some((load) => !load)) return Promise.reject(new Error(`no change data for ${category}`));
  const loading = Promise.all(loaders.map((load) => load())).then((files) =>
    files.flatMap((file) => file.entries.map((entry) => decodeChangeEntry(category, entry))),
  );
  cache.set(category, loading);
  loading.catch(() => cache.delete(category));
  return loading;
}
