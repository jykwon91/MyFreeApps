import { columnIndexes } from "@/games/wow-forever/lib/dungeons/columnIndexes";
import type { BeastTeaching } from "@/games/wow-forever/types/hunterPets/beastTeaching";
import type { HunterPetsData } from "@/games/wow-forever/types/hunterPets/hunterPetsData";
import type { HunterPetsDataFiles } from "@/games/wow-forever/types/hunterPets/hunterPetsDataFiles";
import type { PetAbility } from "@/games/wow-forever/types/hunterPets/petAbility";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";

const MS_PER_SECOND = 1000;

function decodeAbilities(files: HunterPetsDataFiles): PetAbility[] {
  return files.forever.abilities.map((a) => ({
    slug: a.slug,
    name: a.name,
    icon: a.icon,
    isNew: a.new,
    familyIds: a.families,
    ranks: a.ranks.map(([spell, level, text, isNew, families], index) => ({
      spell,
      rank: index + 1,
      level,
      text,
      isNew: isNew === 1,
      familyIds: families ?? a.families,
    })),
  }));
}

/** Joins the Forever file (families, abilities, beasts the client has met) with the Classic beasts. */
export function decodeHunterPets(files: HunterPetsDataFiles): HunterPetsData {
  const abilities = decodeAbilities(files);
  const teachingBySpell = new Map<number, BeastTeaching>();
  for (const ability of abilities) {
    for (const rank of ability.ranks) {
      teachingBySpell.set(rank.spell, {
        spell: rank.spell,
        abilitySlug: ability.slug,
        abilityName: ability.name,
        icon: ability.icon,
        rank: rank.rank,
      });
    }
  }
  const col = columnIndexes("hunterPets.json", files.forever.seenColumns, ["id", "name", "family", "seenOn"] as const);
  const seen = files.forever.seen.map((row) => ({
    id: Number(row[col.id]),
    name: String(row[col.name]),
    familyId: Number(row[col.family]),
    seenOn: String(row[col.seenOn]),
  }));
  const seenOnById = new Map(seen.map((s) => [s.id, s.seenOn]));
  const beasts: TamableBeast[] = files.classic.beasts.map(
    ([id, name, familyId, minLevel, maxLevel, attackMs, zoneKeys, spells]) => ({
      id,
      name,
      familyId,
      minLevel,
      maxLevel,
      attackSeconds: attackMs > 0 ? attackMs / MS_PER_SECOND : null,
      zones: zoneKeys.map((key) => files.classic.zones[key] ?? key),
      teaches: spells.flatMap((spell) => teachingBySpell.get(spell) ?? []),
      inClassic: true,
      seenOn: seenOnById.get(id) ?? null,
    }),
  );
  const classicIds = new Set(beasts.map((b) => b.id));
  for (const { id, name, familyId, seenOn } of seen) {
    if (classicIds.has(id)) continue;
    beasts.push({
      id,
      name,
      familyId,
      minLevel: null,
      maxLevel: null,
      attackSeconds: null,
      zones: [],
      teaches: [],
      inClassic: false,
      seenOn,
    });
  }
  return {
    families: files.forever.families.map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      icon: f.icon,
      diet: f.diet,
      damage: f.damage,
      armor: f.armor,
      health: f.health,
      isNew: f.new,
    })),
    abilities,
    beasts,
  };
}
