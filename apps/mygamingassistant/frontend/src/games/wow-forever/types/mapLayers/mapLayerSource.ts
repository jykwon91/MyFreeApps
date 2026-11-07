import type { ServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";
import type { GatherSkill } from "@/games/wow-forever/types/recipeSources";

/**
 * Where a layer's markers come from:
 * - `service`: service NPCs of one subkind (and profession tag, for profession trainers);
 * - `class_trainer`: the player's own class trainers;
 * - `quest_givers`: quest givers with a quest this player could take now;
 * - `instances`: dungeon and raid entrances;
 * - `transport`: boat, zeppelin and tram stops;
 * - `gathering`: one sample herb / ore spot per node type per zone.
 */
export type MapLayerSource =
  | { kind: "service"; subkind: ServiceKind; tag?: string }
  | { kind: "class_trainer" }
  | { kind: "quest_givers" }
  | { kind: "instances" }
  | { kind: "transport" }
  | { kind: "gathering"; skill: GatherSkill };
