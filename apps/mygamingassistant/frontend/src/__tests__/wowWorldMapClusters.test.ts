import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import type { MapMarker } from "@/games/wow-forever/worldMap/mapLayers";
import { searchMarkers, viewMapSearch } from "@/games/wow-forever/worldMap/mapSearch";
import { CLUSTER_MAX_SCALE, clusterFit, clusterLabel, clusterMarkers } from "@/games/wow-forever/worldMap/markerClusters";
import { searchAllNpcs } from "@/games/wow-forever/worldMap/search";

const data = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
});

const EASTERN_KINGDOMS = 1415;
const IRONFORGE = 1455;
const ELWYNN = 1429;

function marker(id: string, zoneId?: number): MapMarker {
  return { id, world: { continent: 0, wx: 0, wy: 0 }, label: `${id} <Warlock Trainer> — Class trainer`, className: "", zoneId };
}

function map(id: number) {
  const found = data.maps.get(id);
  if (!found) throw new Error(`no map ${id}`);
  return found;
}

describe("marker clusters", () => {
  const a = { marker: marker("a"), px: 100, py: 100 };
  const b = { marker: marker("b"), px: 108, py: 104 };
  const c = { marker: marker("c"), px: 300, py: 100 };

  it("groups markers that would overlap, and splits them once zoomed in far enough", () => {
    const zoomedOut = clusterMarkers([a, b, c], 1, null);
    expect(zoomedOut.map((g) => g.members.map((m) => m.id))).toEqual([["a", "b"], ["c"]]);
    expect(zoomedOut[0].px).toBe(104);
    expect(clusterMarkers([a, b, c], 4, null).every((g) => g.members.length === 1)).toBe(true);
  });

  it("never hides the chosen marker inside a number", () => {
    const groups = clusterMarkers([a, b, c], 1, "b");
    expect(groups.find((g) => g.members.some((m) => m.id === "b"))?.members).toHaveLength(1);
  });

  it("names who is there", () => {
    expect(clusterLabel([marker("Briarthorn"), marker("Thistleheart")])).toBe(
      "2 here: Briarthorn, Thistleheart. Click to zoom in.",
    );
  });

  it("a click opens the map they separate on: Ironforge from the Eastern Kingdoms", () => {
    const hits = searchAllNpcs("warlock trainer ironforge", data, { faction: FACTION.alliance, player: null });
    const view = viewMapSearch({ query: "x", hits }, data, FACTION.alliance, null, false);
    const markers = searchMarkers(view.results);
    expect(markers).toHaveLength(3);
    const fit = clusterFit(data, map(EASTERN_KINGDOMS), markers);
    expect(fit.mapId).toBe(IRONFORGE);
    expect(fit.points).toHaveLength(3);
    expect(fit.maxScale).toBe(CLUSTER_MAX_SCALE);
    // Already on that map (or no closer map holds them all): zoom in where you are.
    expect(clusterFit(data, map(IRONFORGE), markers).mapId).toBe(IRONFORGE);
    expect(clusterFit(data, map(ELWYNN), [marker("x")]).mapId).toBe(ELWYNN);
  });
});
