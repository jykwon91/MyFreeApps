import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { DEFAULT_MAP_LAYERS, MAP_LAYER_DEFS, MAP_LAYER_GROUPS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import { MAP_LAYER, MAP_LAYER_IDS } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import raresJson from "@/games/wow-forever/data/rares/rares.json";
import rareSpawnsJson from "@/games/wow-forever/data/rares/classic/rareSpawns.json";
import { decodeRares } from "@/games/wow-forever/lib/rares/decodeRares";
import { rareIdOfMarker } from "@/games/wow-forever/lib/rares/rareMarkerId";
import type { RareDataFiles } from "@/games/wow-forever/types/rares/rareDataFiles";
import type { LayerContext } from "@/games/wow-forever/types/mapLayers/layerContext";
import { ZONE_FIT } from "@/games/wow-forever/types/mapLayers/zoneFit";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import { gatheringMapSpots } from "@/games/wow-forever/worldMap/gatheringMapSpots";
import {
  activeLayerCount,
  layerCounts,
  layerCountText,
  layerLabel,
  markersByLayer,
  mergeMarkers,
  visibleLayerMarkers,
} from "@/games/wow-forever/worldMap/layerMarkers";
import type { MapMarker } from "@/games/wow-forever/worldMap/mapLayers";
import { DEFAULT_MAP_LAYER_SETTINGS, parseMapLayerSettings, sameLayers, withLayers } from "@/games/wow-forever/worldMap/mapLayerSettings";
import { zoneFit, zoneFitsOf, zoneLevelText } from "@/games/wow-forever/worldMap/zoneFit";
import { labelBox, placeZoneLabels, zoneLabels } from "@/games/wow-forever/worldMap/zoneLabels";

const data = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
});

const EASTERN_KINGDOMS = 1415;
const KALIMDOR = 1414;
const ELWYNN = 1429;
const WESTFALL = 1436;
const DUSKWOOD = 1431;
const STORMWIND = 1453;

function map(id: number) {
  const found = data.maps.get(id);
  if (!found) throw new Error(`no map ${id}`);
  return found;
}

const alliance: LayerContext = { faction: FACTION.alliance, classId: "warlock", level: 12, gathering: null, rares: null };
const horde: LayerContext = { ...alliance, faction: FACTION.horde };

function marker(id: string): MapMarker {
  return { id, world: { continent: 0, wx: 0, wy: 0 }, label: id, className: "" };
}

describe("map layer catalog", () => {
  it("has every layer in exactly one group, and defaults for each", () => {
    const grouped = MAP_LAYER_GROUPS.flatMap((g) => g.layers);
    expect([...grouped].sort()).toEqual([...MAP_LAYER_IDS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(MAP_LAYER_DEFS.map((d) => d.id).sort()).toEqual([...MAP_LAYER_IDS].sort());
    expect(Object.keys(DEFAULT_MAP_LAYERS).sort()).toEqual([...MAP_LAYER_IDS].sort());
  });

  it("starts with flight masters, inns, your class trainers and dungeons on", () => {
    const on = MAP_LAYER_IDS.filter((id) => DEFAULT_MAP_LAYERS[id]);
    expect(on.sort()).toEqual([MAP_LAYER.flightMasters, MAP_LAYER.innkeepers, MAP_LAYER.classTrainers, MAP_LAYER.dungeons].sort());
  });

  it("names the class trainer layer after your class and profession layers after the profession", () => {
    const byId = new Map(MAP_LAYER_DEFS.map((d) => [d.id, d]));
    expect(layerLabel(byId.get(MAP_LAYER.classTrainers)!, "warlock")).toBe("Warlock trainers");
    expect(layerLabel(byId.get(MAP_LAYER.flightMasters)!, "warlock")).toBe("Flight masters");
  });
});

describe("layer markers and counts", () => {
  it("counts each layer on the viewed map, your faction and neutral only", () => {
    const elwynn = markersByLayer(data, map(ELWYNN), alliance);
    const counts = layerCounts(elwynn, alliance);
    expect(counts[MAP_LAYER.flightMasters]).toBeGreaterThan(0);
    expect(counts[MAP_LAYER.innkeepers]).toBeGreaterThan(0);
    // Every flight master on the Alliance's Elwynn map is Alliance or neutral.
    for (const m of elwynn.get(MAP_LAYER.flightMasters) ?? []) {
      const poi = data.poiById.get(m.id);
      expect(poi && poi.faction !== FACTION.horde).toBe(true);
    }
    const hordeView = layerCounts(markersByLayer(data, map(ELWYNN), horde), alliance);
    expect(hordeView[MAP_LAYER.flightMasters]).toBeLessThan(counts[MAP_LAYER.flightMasters]!);
  });

  it("a continent counts more than one of its zones", () => {
    const zone = layerCounts(markersByLayer(data, map(ELWYNN), alliance), alliance);
    const continent = layerCounts(markersByLayer(data, map(EASTERN_KINGDOMS), alliance), alliance);
    expect(continent[MAP_LAYER.flightMasters]!).toBeGreaterThan(zone[MAP_LAYER.flightMasters]!);
    expect(continent[MAP_LAYER.dungeons]!).toBeGreaterThan(0);
  });

  it("class trainers are your class's only", () => {
    const warlock = markersByLayer(data, map(EASTERN_KINGDOMS), alliance).get(MAP_LAYER.classTrainers) ?? [];
    expect(warlock.length).toBeGreaterThan(0);
    for (const m of warlock) {
      const poi = data.poiById.get(m.id);
      expect(poi?.subkind).toBe(SERVICE_KIND.classTrainer);
      expect(poi?.tag).toBe("warlock");
    }
  });

  it("quest givers follow your level (+2 lookahead)", () => {
    const low = layerCounts(markersByLayer(data, map(ELWYNN), { ...alliance, level: 1 }), alliance)[MAP_LAYER.questGivers]!;
    const high = layerCounts(markersByLayer(data, map(ELWYNN), { ...alliance, level: 10 }), alliance)[MAP_LAYER.questGivers]!;
    expect(high).toBeGreaterThan(low);
  });

  it("boats, zeppelins and the tram are drawn at their stops, only the ones you may ride", () => {
    const stops = markersByLayer(data, map(EASTERN_KINGDOMS), alliance).get(MAP_LAYER.transports) ?? [];
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.every((m) => m.id.startsWith("transport:") && m.label.includes(" — "))).toBe(true);
    const hordeStops = markersByLayer(data, map(EASTERN_KINGDOMS), horde).get(MAP_LAYER.transports) ?? [];
    expect(hordeStops.map((m) => m.id)).not.toEqual(stops.map((m) => m.id));
  });

  it("rare pins are unknown until the rares load, then every spawn shows for both factions", () => {
    expect(layerCounts(markersByLayer(data, map(ELWYNN), alliance), alliance)[MAP_LAYER.rares]).toBeNull();
    const { rares } = decodeRares({ forever: raresJson, classic: rareSpawnsJson } as unknown as RareDataFiles);
    const withRares = { ...alliance, rares };
    const elwynn = markersByLayer(data, map(ELWYNN), withRares).get(MAP_LAYER.rares) ?? [];
    const morgaine = elwynn.filter((m) => rareIdOfMarker(m.id) === 99);
    expect(morgaine.length).toBeGreaterThan(0);
    expect(morgaine[0].label).toBe("Morgaine the Sly — level 10 rare");
    expect(layerCounts(markersByLayer(data, map(ELWYNN), withRares), withRares)[MAP_LAYER.rares]).toBe(elwynn.length);
    const hordeView = markersByLayer(data, map(ELWYNN), { ...horde, rares }).get(MAP_LAYER.rares) ?? [];
    expect(hordeView.map((m) => m.id)).toEqual(elwynn.map((m) => m.id));
    // Rares new in Forever have no Classic spawns, so no pins.
    expect((markersByLayer(data, map(EASTERN_KINGDOMS), withRares).get(MAP_LAYER.rares) ?? []).some((m) => rareIdOfMarker(m.id) === 210107)).toBe(false);
  });

  it("gathering counts are unknown until the file loads, then counted", () => {
    expect(layerCounts(markersByLayer(data, map(ELWYNN), alliance), alliance)[MAP_LAYER.herbs]).toBeNull();
    const lookup = createSourceLookup(sourcesJson as unknown as RawSourcesFile);
    const spots = gatheringMapSpots((itemId) => lookup.reagent(itemId));
    expect(spots.some((s) => s.skill === "herbalism")).toBe(true);
    expect(spots.some((s) => s.skill === "mining")).toBe(true);
    // One spot per node type per zone.
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
    const counts = layerCounts(markersByLayer(data, map(ELWYNN), { ...alliance, gathering: spots }), { ...alliance, gathering: spots });
    expect(counts[MAP_LAYER.herbs]).toBeGreaterThan(0);
    expect(counts[MAP_LAYER.ore]).toBeGreaterThan(0);
  });

  it("draws only the switched-on layers, each marker once", () => {
    const byLayer = markersByLayer(data, map(ELWYNN), alliance);
    const none = withLayers(DEFAULT_MAP_LAYERS, MAP_LAYER_IDS, false);
    expect(visibleLayerMarkers(byLayer, none)).toHaveLength(0);
    const flights = withLayers(none, [MAP_LAYER.flightMasters], true);
    expect(visibleLayerMarkers(byLayer, flights)).toHaveLength(byLayer.get(MAP_LAYER.flightMasters)!.length);
    const both = withLayers(flights, [MAP_LAYER.innkeepers, MAP_LAYER.vendors], true);
    const shown = visibleLayerMarkers(byLayer, both);
    expect(new Set(shown.map((m) => m.id)).size).toBe(shown.length);
    expect(activeLayerCount(both)).toBe(3);
  });

  it("merging keeps the first list's marker for a shared id", () => {
    const first = { ...marker("a"), label: "result" };
    const merged = mergeMarkers([first, marker("b")], [marker("a"), marker("c")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(merged[0].label).toBe("result");
  });

  it("says why a count is missing", () => {
    expect(layerCountText(3, false)).toBe("3");
    expect(layerCountText(null, false)).toBe("loading");
    expect(layerCountText(null, true)).toBe("didn't load");
  });
});

describe("saved layer settings", () => {
  it("keeps known layers, drops unknown keys and fills the rest with defaults", () => {
    const parsed = parseMapLayerSettings({ layers: { [MAP_LAYER.vendors]: true, [MAP_LAYER.dungeons]: false, nope: true }, levelFit: false });
    expect(parsed?.layers[MAP_LAYER.vendors]).toBe(true);
    expect(parsed?.layers[MAP_LAYER.dungeons]).toBe(false);
    expect(parsed?.layers[MAP_LAYER.flightMasters]).toBe(true);
    expect(parsed && "nope" in parsed.layers).toBe(false);
    expect(parsed?.levelFit).toBe(false);
  });

  it("ignores junk", () => {
    expect(parseMapLayerSettings(null)).toBeNull();
    expect(parseMapLayerSettings("x")).toBeNull();
    expect(parseMapLayerSettings({ layers: "x", levelFit: 3 })).toEqual(DEFAULT_MAP_LAYER_SETTINGS);
  });

  it("knows when the layers are back at the defaults", () => {
    expect(sameLayers(DEFAULT_MAP_LAYERS, DEFAULT_MAP_LAYERS)).toBe(true);
    expect(sameLayers(withLayers(DEFAULT_MAP_LAYERS, [MAP_LAYER.vendors], true), DEFAULT_MAP_LAYERS)).toBe(false);
  });
});

describe("where to level", () => {
  it("rates a zone right from 2 levels under its range to its top", () => {
    expect(zoneFit([12, 18], 9)).toBe(ZONE_FIT.tooHigh);
    expect(zoneFit([12, 18], 10)).toBe(ZONE_FIT.right);
    expect(zoneFit([12, 18], 18)).toBe(ZONE_FIT.right);
    expect(zoneFit([12, 18], 19)).toBe(ZONE_FIT.tooLow);
    expect(zoneFit(undefined, 10)).toBeNull();
    expect(zoneFit([12, 18], null)).toBeNull();
  });

  it("writes a range as players read it", () => {
    expect(zoneLevelText([5, 10])).toBe("5–10");
    expect(zoneLevelText([55, 55])).toBe("55");
  });

  it("tints each zone of a continent, leaving cities and unrated zones out", () => {
    const fits = zoneFitsOf(data, map(EASTERN_KINGDOMS), 14);
    expect(fits.get(WESTFALL)).toBe(ZONE_FIT.right);
    expect(fits.get(ELWYNN)).toBe(ZONE_FIT.tooLow);
    expect(fits.get(DUSKWOOD)).toBe(ZONE_FIT.tooHigh);
    expect(fits.has(STORMWIND)).toBe(false);
  });
});

describe("zone level labels", () => {
  it("labels a continent's zones with their levels, cities as City; nothing on a zone map", () => {
    const labels = zoneLabels(data, map(EASTERN_KINGDOMS));
    expect(labels.find((l) => l.zoneId === ELWYNN)).toMatchObject({ name: "Elwynn Forest", detail: "5–10" });
    expect(labels.find((l) => l.zoneId === STORMWIND)?.detail).toBe("City");
    expect(zoneLabels(data, map(ELWYNN))).toHaveLength(0);
  });

  it("places labels so none overlap, and more fit as the map gets bigger", () => {
    for (const continent of [EASTERN_KINGDOMS, KALIMDOR]) {
      const labels = zoneLabels(data, map(continent));
      const phone = placeZoneLabels(labels, 343, 229);
      const zoomed = placeZoneLabels(labels, 343 * 4, 229 * 4);
      expect(phone.length).toBeGreaterThan(0);
      expect(zoomed.length).toBeGreaterThan(phone.length);
      for (const [w, h, placed] of [[343, 229, phone], [343 * 4, 229 * 4, zoomed]] as const) {
        const rects = placed.map((l) => {
          const box = labelBox(l);
          const cx = (l.x / 100) * w;
          const cy = (l.y / 100) * h;
          return { l: cx - box.width / 2, r: cx + box.width / 2, t: cy - box.height / 2, b: cy + box.height / 2 };
        });
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            expect(a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t).toBe(false);
          }
        }
      }
    }
  });
});
