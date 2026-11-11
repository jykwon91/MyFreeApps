import { CITY_ZONE_KIND } from "@/games/wow-forever/data/trainers/trainersConfig";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import type { TrainerServices } from "@/games/wow-forever/types/trainers/trainerServices";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/**
 * Every NPC of one service kind and tag (a class or profession) your faction can
 * use, neutral ones too, capitals first then by area name. Classic (cmangos) spawns.
 */
export function serviceTrainers(
  services: TrainerServices,
  kind: string,
  tag: string | null,
  faction: PlayerFaction,
): readonly RankTrainer[] {
  const zones = new Map(services.zones.map((z) => [z.id, z]));
  const trainers = services.rows
    .filter((r) => r[2] === kind && (tag === null || r[3] === tag) && (r[11] === faction || r[11] === "N"))
    .map(([, npcId, , , name, , zoneId, subzone, x, y]): RankTrainer => {
      const zone = zones.get(zoneId);
      const zoneName = zone?.name ?? "";
      return {
        npcId,
        name,
        zoneId,
        x,
        y,
        city: zone?.kind === CITY_ZONE_KIND,
        where: subzone && subzone !== zoneName ? `${subzone}, ${zoneName}` : zoneName,
      };
    });
  return trainers.sort((a, b) => Number(b.city) - Number(a.city) || a.where.localeCompare(b.where) || a.name.localeCompare(b.name));
}
