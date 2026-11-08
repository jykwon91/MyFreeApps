import { DOWNRANK_CLASSIC_FILES, DOWNRANK_SPELL_FILES } from "@/games/wow-forever/data/downrank/downrankFiles";
import type { DownrankClassicFile } from "@/games/wow-forever/types/downrank/downrankClassicFile";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";
import type { DownrankFile } from "@/games/wow-forever/types/downrank/downrankFile";

let cache: Promise<readonly DownrankFamily[]> | null = null;

/** Each family with its Forever ranks and any Classic ones filled in, in rank order. */
export function mergeDownrankFiles(file: DownrankFile, classic: DownrankClassicFile): DownrankFamily[] {
  const extra = new Map(classic.families.map((f) => [f.id, f.ranks]));
  return file.families.map((family) => {
    const fill = extra.get(family.id);
    if (!fill?.length) return family;
    return { ...family, ranks: [...family.ranks, ...fill].sort((a, b) => a.rank - b.rank) };
  });
}

/** The calculator's data, loaded once per visit; a failed load is forgotten so a retry fetches again. */
export function loadDownrank(): Promise<readonly DownrankFamily[]> {
  if (cache) return cache;
  const spells = DOWNRANK_SPELL_FILES["./spells.json"];
  const classic = DOWNRANK_CLASSIC_FILES["./classic/ranks.json"];
  if (!spells || !classic) return Promise.reject(new Error("no downrank data"));
  const loading = Promise.all([spells(), classic()]).then(([file, classicFile]) => mergeDownrankFiles(file, classicFile));
  cache = loading;
  loading.catch(() => {
    cache = null;
  });
  return loading;
}
