import { createSpotDecoder } from "@/games/wow-forever/data/spotDecode";
import type { LeatherBracket } from "@/games/wow-forever/types/gathering/leatherBracket";
import type { SkinnableMob } from "@/games/wow-forever/types/gathering/skinnableMob";
import type { SkinningFile } from "@/games/wow-forever/types/gathering/skinningFile";

/** The generated Skinning file as typed rows; a mob row with no zone is skipped. */
export function decodeSkinning(raw: SkinningFile): { mobs: SkinnableMob[]; leather: LeatherBracket[] } {
  const { spotAt } = createSpotDecoder(raw.zones, raw.territory);
  const mobs = raw.mobs.flatMap((row): SkinnableMob[] => {
    const [name, minLevel, maxLevel, spawns, zoneId, subzone, x, y, leather] = row;
    const spot = spotAt(zoneId, subzone, x, y);
    if (!spot) return [];
    return [{ name: String(name), minLevel: Number(minLevel), maxLevel: Number(maxLevel), spawns: Number(spawns), spot, leather: String(leather) }];
  });
  const leather = raw.leather.map(([minLevel, maxLevel, leathers]) => ({
    minLevel: Number(minLevel),
    maxLevel: Number(maxLevel),
    leathers: (Array.isArray(leathers) ? leathers : []).map(String),
  }));
  return { mobs, leather };
}
