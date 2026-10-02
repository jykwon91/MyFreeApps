import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import areasJson from "@/games/wow-forever/data/worldMap/areas.json";
import interiorsJson from "@/games/wow-forever/data/worldMap/classic/classicInteriors.json";
import { CITY_TRAINERS, TOWN_TRAINERS } from "@/games/wow-forever/data/professions/trainers";
import { CRAFTING_RANKS, CRAFTING_TRAINERS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import { areaLabel } from "@/games/wow-forever/worldMap/describeRank";
import { planDirections } from "@/games/wow-forever/worldMap/directions";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { buildPlaces, findPlaces, nearestTown, placeLabel, PLACE_KIND } from "@/games/wow-forever/worldMap/places";
import { commonMapOf, defaultResultCount, fitResults, searchMarkers, viewMapSearch } from "@/games/wow-forever/worldMap/mapSearch";
import { findLinkedPoi, MAX_NPC_RESULTS, searchAllNpcs, searchMap, searchNpcs } from "@/games/wow-forever/worldMap/search";
import { ENDPOINT_KIND, resolveEndpoint } from "@/games/wow-forever/worldMap/trip";
import { relatedMaps, resolveWhere, WHERE_RESULT } from "@/games/wow-forever/worldMap/where";

const data = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
  areas: areasJson,
  interiors: interiorsJson,
});
const places = buildPlaces(data);

const ELWYNN = 1429;
const STORMWIND = 1453;
const ORGRIMMAR = 1454;

function zone(id: number) {
  const z = data.zoneById.get(id);
  if (!z) throw new Error(`no zone ${id}`);
  return z;
}

const inGoldshire = { zone: zone(ELWYNN), world: zoneToWorld(zone(ELWYNN), 42, 65) };

describe("NPC search", () => {
  it("finds an NPC by part of their name", () => {
    const [first] = searchNpcs("ryback", data, { faction: FACTION.alliance, player: null });
    expect(first.poi.name).toBe("Stephen Ryback");
    expect(first.zone.id).toBe(STORMWIND);
  });

  it("finds NPCs by what they are and where, in any word order", () => {
    const hits = searchNpcs("cooking trainer stormwind", data, { faction: FACTION.alliance, player: null });
    expect(hits.map((h) => h.poi.name)).toContain("Stephen Ryback");
    expect(searchNpcs("stormwind cooking", data, { faction: FACTION.alliance, player: null })[0].poi.name).toBe(
      "Stephen Ryback",
    );
  });

  it("finds plain vendors too, by name or what they sell", () => {
    const [heming] = searchNpcs("Old Man Heming", data, { faction: FACTION.alliance, player: null });
    expect(heming.poi.name).toBe("Old Man Heming");
    expect(heming.zone.name).toBe("Stranglethorn Vale");
    const [khara] = searchNpcs("fishing supplies loch modan", data, { faction: FACTION.alliance, player: null });
    expect(khara.poi).toMatchObject({ name: "Khara Deepwater", subkind: "vendor" });
  });

  it("puts your faction's NPCs before the other faction's", () => {
    const hits = searchNpcs("flight master", data, { faction: FACTION.horde, player: null });
    expect(hits[0].poi.faction).not.toBe(FACTION.alliance);
  });

  it("puts the nearest first when you've said where you are", () => {
    const hits = searchNpcs("innkeeper", data, { faction: FACTION.alliance, player: inGoldshire });
    expect(hits[0].poi.subzone).toBe("Goldshire");
  });

  it("shows an NPC once even when they also give quests", () => {
    const hits = searchNpcs("Maximillian Crowe", data, { faction: FACTION.alliance, player: null });
    expect(hits).toHaveLength(1);
  });

  it("ignores case, apostrophes and accents, and finds nothing for nonsense", () => {
    expect(searchNpcs("LAUTIKI", data, { faction: FACTION.horde, player: null })[0].poi.name).toBe("Lau'Tiki");
    expect(searchNpcs("zzqqxx", data, { faction: FACTION.alliance, player: null })).toEqual([]);
    expect(searchNpcs("   ", data, { faction: FACTION.alliance, player: null })).toEqual([]);
  });

  it("finds a dungeon by what players call it", () => {
    const alliance = { faction: FACTION.alliance, player: null };
    for (const q of ["stockade", "the stockade", "stocks", "Stormwind Stockade"]) {
      expect(searchNpcs(q, data, alliance)[0].poi.name, q).toBe("Stormwind Stockade");
    }
    expect(searchNpcs("vc", data, alliance)[0].poi.name).toBe("Deadmines");
    expect(searchNpcs("the deadmines", data, alliance)[0].poi.name).toBe("Deadmines");
    expect(searchNpcs("sfk", data, alliance)[0].poi.name).toBe("Shadowfang Keep");
  });

  it("finds a dungeon by one of its bosses, and says which", () => {
    const [stockade] = searchNpcs("targorr", data, { faction: FACTION.alliance, player: null });
    expect(stockade).toMatchObject({ byName: true, boss: "Targorr the Dread" });
    expect(stockade.poi.name).toBe("Stormwind Stockade");
    const [deadmines] = searchNpcs("van cleef", data, { faction: FACTION.alliance, player: null });
    expect(deadmines.poi.name).toBe("Deadmines");
    // Searched by the dungeon's own name, no boss is named.
    expect(searchNpcs("deadmines", data, { faction: FACTION.alliance, player: null })[0].boss).toBeUndefined();
  });

  it("reads ?npc= as a creature id, else a map result id", () => {
    expect(findLinkedPoi("5482", data)?.name).toBe("Stephen Ryback");
    const anyPoi = data.pois[0];
    expect(findLinkedPoi(anyPoi.id, data)).toBe(anyPoi);
    expect(findLinkedPoi("999999999", data)).toBeUndefined();
  });
});

describe("Show all on the map", () => {
  const alliance = { faction: FACTION.alliance, player: null };
  const EASTERN_KINGDOMS = 1415;

  it('"warlock trainer" finds every warlock trainer — not demon trainers, and not capped', () => {
    const hits = searchAllNpcs("warlock trainer", data, alliance);
    expect(hits.length).toBeGreaterThan(MAX_NPC_RESULTS);
    expect(hits.every((h) => h.poi.title === "Warlock Trainer")).toBe(true);
    expect(hits.map((h) => h.poi.name)).toEqual(expect.arrayContaining(["Maximillian Crowe", "Demisette Cloyce", "Briarthorn"]));
    expect(hits.some((h) => !h.byName)).toBe(true);
    // One word still finds everything a warlock needs, demon trainers too.
    expect(searchAllNpcs("warlock", data, alliance).some((h) => h.poi.title === "Demon Trainer")).toBe(true);
  });

  it("the suggestions stay short, the show-all list has every match", () => {
    const results = searchMap("flight master", data, places, alliance);
    expect(results.npcs).toHaveLength(MAX_NPC_RESULTS);
    expect(results.allNpcs.length).toBeGreaterThan(30);
  });

  it("shows your side by default, counts the other faction's, and fits the map to them all", () => {
    const search = { query: "warlock trainer", hits: searchAllNpcs("warlock trainer", data, alliance) };
    const view = viewMapSearch(search, data, FACTION.alliance, null, false);
    expect(view.results.every((r) => r.poi.faction !== FACTION.horde)).toBe(true);
    expect(view.otherFactionCount).toBeGreaterThan(0);
    expect(view.results.length + view.otherFactionCount).toBe(search.hits.length);
    expect(defaultResultCount(search.hits, FACTION.alliance)).toBe(view.results.length);
    // Alliance warlock trainers are all in the Eastern Kingdoms: zoom out to that continent, a marker each.
    const fit = fitResults(data, view.results);
    expect(fit?.mapId).toBe(EASTERN_KINGDOMS);
    expect(fit?.points).toHaveLength(view.results.length);
    expect(searchMarkers(view.results)).toHaveLength(view.results.length);

    const everyone = viewMapSearch(search, data, FACTION.alliance, null, true);
    expect(everyone.results).toHaveLength(search.hits.length);
    expect(fitResults(data, everyone.results)?.mapId).toBe(data.worldMapId);
  });

  it("nearest first once you've said where you are; by continent and zone before", () => {
    const search = { query: "warlock trainer", hits: searchAllNpcs("warlock trainer", data, alliance) };
    const near = viewMapSearch(search, data, FACTION.alliance, inGoldshire, false);
    expect(near.results[0].poi.name).toBe("Maximillian Crowe");
    expect(near.results[0].yards).not.toBeNull();
    const unmeasured = viewMapSearch(search, data, FACTION.alliance, null, false);
    expect(unmeasured.results.every((r) => r.yards === null)).toBe(true);
    const zones = unmeasured.results.map((r) => r.zone.name);
    expect(zones).toEqual([...zones].sort((a, b) => a.localeCompare(b)));
  });

  it("only the other faction's match: shows those rather than nothing", () => {
    const hits = searchAllNpcs("orgrimmar flight master", data, alliance);
    expect(hits.length).toBeGreaterThan(0);
    const view = viewMapSearch({ query: "orgrimmar flight master", hits }, data, FACTION.alliance, null, false);
    expect(view.results).toHaveLength(hits.length);
    expect(view.otherFactionCount).toBe(0);
  });

  it("the common map is the zone, the continent or Azeroth", () => {
    expect(commonMapOf(data, [STORMWIND])).toBe(STORMWIND);
    expect(commonMapOf(data, [STORMWIND, ELWYNN])).toBe(EASTERN_KINGDOMS);
    expect(commonMapOf(data, [STORMWIND, ORGRIMMAR])).toBe(data.worldMapId);
  });
});

describe("places", () => {
  it("knows zones, capitals, their districts and towns", () => {
    const names = places.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Elwynn Forest", "Stormwind City", "Old Town", "Goldshire"]));
    const oldTown = places.find((p) => p.name === "Old Town");
    expect(oldTown).toMatchObject({ kind: PLACE_KIND.district, zoneId: STORMWIND, spot: null });
    const goldshire = places.find((p) => p.name === "Goldshire");
    expect(goldshire?.zoneId).toBe(ELWYNN);
    expect(goldshire?.spot?.x).toBeGreaterThan(38);
    expect(goldshire?.spot?.x).toBeLessThan(48);
  });

  it("matches common names and short forms", () => {
    expect(findPlaces("stormwind city", places)[0].zoneId).toBe(STORMWIND);
    expect(findPlaces("Stormwind", places)[0].zoneId).toBe(STORMWIND);
    expect(findPlaces("sw", places)[0].zoneId).toBe(STORMWIND);
    expect(findPlaces("org", places)[0].zoneId).toBe(ORGRIMMAR);
    expect(placeLabel(findPlaces("goldshire", places)[0])).toBe("Goldshire, Elwynn Forest");
  });

  it("finds buildings and named areas no NPC stands in", () => {
    const WETLANDS = 1437;
    const [tavern] = findPlaces("deepwater tavern", places);
    expect(tavern).toMatchObject({ name: "Deepwater Tavern", kind: PLACE_KIND.building, zoneId: WETLANDS, town: "Menethil Harbor" });
    // Helbrek, the tavern's innkeeper, stands at about 10.7, 60.9.
    expect(tavern.spot?.x).toBeCloseTo(10.7, 0);
    expect(tavern.spot?.y).toBeCloseTo(60.9, 0);
    expect(placeLabel(tavern)).toBe("Deepwater Tavern, Menethil Harbor, Wetlands");
    expect(findPlaces("tavern menethil", places)[0].name).toBe("Deepwater Tavern");
    expect(findPlaces("menethil keep", places)[0]).toMatchObject({ zoneId: WETLANDS });
    // A town the NPCs already name stays one place, a town.
    expect(places.filter((p) => p.name === "Goldshire" && p.zoneId === ELWYNN).map((p) => p.kind)).toEqual([PLACE_KIND.town]);
    expect(resolveWhere("Deepwater Tavern", data, places, null)).toMatchObject({
      kind: WHERE_RESULT.set,
      zoneId: WETLANDS,
      approximate: false,
    });
    // A route ends on the tavern's floor, labelled with its town.
    const end = resolveEndpoint({ kind: ENDPOINT_KIND.place, placeId: tavern.id }, data, places, FACTION.alliance);
    expect(end).toMatchObject({ title: "Deepwater Tavern, Menethil Harbor, Wetlands", note: "Routing to Deepwater Tavern.", pinpoint: true });
    expect(end?.route.place.subzone).toBe("Menethil Harbor");
    expect(end?.route.world.z).toBe(tavern.z);
  });

  it("names the town a spot is near", () => {
    expect(nearestTown(places, ELWYNN, 42.5, 65.5)?.name).toBe("Goldshire");
    expect(nearestTown(places, ELWYNN, 90, 5)).toBeNull();
  });
});

describe("where are you?", () => {
  it("a capital's name opens its map, measured from the middle", () => {
    expect(resolveWhere("stormwind city", data, places, null)).toMatchObject({
      kind: WHERE_RESULT.set,
      zoneId: STORMWIND,
      position: null,
    });
  });

  it("a town's name puts you at the middle of town, marked approximate", () => {
    const result = resolveWhere("Goldshire", data, places, null);
    expect(result).toMatchObject({ kind: WHERE_RESULT.set, zoneId: ELWYNN, approximate: true });
  });

  it("what the minimap shows — a district plus coordinates — picks the city's map", () => {
    expect(resolveWhere("Old Town 78.4, 53.2", data, places, ELWYNN)).toMatchObject({
      kind: WHERE_RESULT.set,
      zoneId: STORMWIND,
      position: { x: 78.4, y: 53.2 },
      approximate: false,
    });
  });

  it("bare coordinates go on the zone already picked, and need one", () => {
    expect(resolveWhere("42.1, 65.9", data, places, ELWYNN)).toMatchObject({
      kind: WHERE_RESULT.set,
      zoneId: ELWYNN,
      position: { x: 42.1, y: 65.9 },
      onCurrentZone: true,
    });
    const result = resolveWhere("42.1, 65.9", data, places, null);
    expect(result.kind).toBe(WHERE_RESULT.error);
  });

  it("still reads /way commands", () => {
    expect(resolveWhere("/way Elwynn Forest 42 65", data, places, null)).toMatchObject({
      kind: WHERE_RESULT.set,
      zoneId: ELWYNN,
      position: { x: 42, y: 65 },
    });
  });

  it("asks which one when a name fits several places, and explains a miss", () => {
    const result = resolveWhere("valley", data, places, null);
    expect(result.kind).toBe(WHERE_RESULT.choose);
    if (result.kind === WHERE_RESULT.choose) expect(result.options.length).toBe(6);
    expect(resolveWhere("ironforge", data, places, null)).toMatchObject({ kind: WHERE_RESULT.set, zoneId: 1455 });
    const miss = resolveWhere("Narnia", data, places, null);
    expect(miss.kind).toBe(WHERE_RESULT.error);
    if (miss.kind === WHERE_RESULT.error) expect(miss.message).toMatch(/Couldn't find "Narnia"/);
    expect(resolveWhere("Goldshire 150, 20", data, places, null).kind).toBe(WHERE_RESULT.error);
  });

  it("offers the capital sharing a zone's ground, and back", () => {
    expect(relatedMaps(zone(ELWYNN), data).map((z) => z.id)).toEqual([STORMWIND]);
    expect(relatedMaps(zone(STORMWIND), data).map((z) => z.id)).toEqual([ELWYNN]);
  });
});

describe("directions text", () => {
  it("keeps coordinates out of every step but the last", () => {
    const target = data.pois.find((p) => p.npcId === 5482);
    if (!target) throw new Error("no Ryback");
    const start = { world: inGoldshire.world, place: { label: "you", zoneId: ELWYNN, zoneName: "Elwynn Forest", subzone: "", x: 42, y: 65 } };
    const end = {
      world: zoneToWorld(zone(STORMWIND), target.x, target.y),
      place: { label: target.name, zoneId: STORMWIND, zoneName: "Stormwind City", subzone: "", x: target.x, y: target.y },
    };
    const directions = planDirections(start, end, FACTION.alliance, data);
    const steps = directions?.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps.slice(0, -1)) expect(step.text).not.toMatch(/\(\d+\.\d, \d+\.\d\)/);
    expect(steps[steps.length - 1].text).toMatch(/\(78\.2, 53\.1\)$/);
  });
});

describe("Profession trainers link to the map", () => {
  const trainers = [
    ...CITY_TRAINERS.flatMap((c) => [c.cooking, c.fishing]),
    ...Object.values(TOWN_TRAINERS).flatMap((t) => [...t.cooking, ...t.fishing]),
    ...Object.values(CRAFTING_TRAINERS).flatMap((t) => [
      ...Object.values(t.cities).flatMap((cities) => cities.map((c) => c.npc)),
      ...Object.values(t.towns).flat(),
    ]),
    ...Object.values(CRAFTING_RANKS)
      .flat()
      .flatMap((r) => (r.trainers.kind === "named" ? Object.values(r.trainers.trainers) : [])),
  ];

  it.each(trainers.map((t) => [t.name, t] as const))("%s is on the World Map where the page says", (_name, trainer) => {
    const poi = findLinkedPoi(String(trainer.npcId), data);
    expect(poi?.name).toBe(trainer.name);
    if (!poi) return;
    expect(areaLabel(poi, zone(poi.zone))).toBe(trainer.where);
    expect(poi.x).toBeCloseTo(trainer.x, 1);
    expect(poi.y).toBeCloseTo(trainer.y, 1);
  });

  it("links the Artisan Enchanting trainer to the Uldaman entrance", () => {
    for (const rank of Object.values(CRAFTING_RANKS).flat()) {
      if (rank.trainers.kind !== "dungeon") continue;
      const id = new URL(rank.trainers.dungeonLink, "https://x").searchParams.get("npc") ?? "";
      expect(findLinkedPoi(id, data)?.name).toBe(rank.trainers.dungeon);
    }
  });
});
