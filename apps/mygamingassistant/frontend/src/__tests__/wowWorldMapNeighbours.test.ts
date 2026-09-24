import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import {
  EDGE_BAND_PX,
  estimateLabelLength,
  frameRect,
  layoutEdge,
  layoutEdgeLabels,
  type FrameRect,
} from "@/games/wow-forever/worldMap/edgeLabelLayout";
import { isZoneView } from "@/games/wow-forever/worldMap/mapHitTest";
import { MAP_EDGE, edgeToward, neighbourLabels } from "@/games/wow-forever/worldMap/mapNeighbours";

const data = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
});

const EASTERN_KINGDOMS = 1415;
const ELWYNN = 1429;
const DUN_MOROGH = 1426;
const STRANGLETHORN = 1434;
const STORMWIND = 1453;
const WETLANDS = 1437;
const ASHENVALE = 1440;

function names(mapId: number): string[] {
  return neighbourLabels(data, mapId).map((l) => l.target.name);
}

function label(mapId: number, name: string) {
  const found = neighbourLabels(data, mapId).find((l) => l.target.name === name);
  if (!found) throw new Error(`${name} is not a neighbour of ${mapId}`);
  return found;
}

describe("which zones are neighbours", () => {
  it("Stranglethorn borders Westfall, Duskwood, Deadwind Pass and the Blasted Lands — not the Swamp of Sorrows", () => {
    // The Swamp is on Stranglethorn's picture, but its land never touches Stranglethorn's.
    expect(names(STRANGLETHORN)).toEqual(["Blasted Lands", "Deadwind Pass", "Duskwood", "Westfall"]);
  });

  it("finds borders across the mountain gaps between outlines", () => {
    expect(names(DUN_MOROGH)).toEqual(expect.arrayContaining(["Loch Modan", "Wetlands"]));
    expect(names(WETLANDS)).toEqual(expect.arrayContaining(["Arathi Highlands", "Dun Morogh", "Loch Modan"]));
    expect(names(ASHENVALE)).toEqual(expect.arrayContaining(["The Barrens", "Stonetalon Mountains", "Darkshore"]));
  });

  it("Elwynn borders Westfall, Duskwood, Redridge and the Burning Steppes, but not Deadwind Pass or its own capital", () => {
    expect(names(ELWYNN)).toEqual(["Burning Steppes", "Duskwood", "Redridge Mountains", "Westfall"]);
  });

  it("a capital's neighbour is the zone around it", () => {
    expect(names(STORMWIND)).toEqual(["Elwynn Forest"]);
  });

  it("labels no edges on a continent", () => {
    expect(neighbourLabels(data, EASTERN_KINGDOMS)).toEqual([]);
  });
});

describe("where a neighbour is named", () => {
  it("on the side it lies past, where it is along that side", () => {
    expect(label(STRANGLETHORN, "Westfall").edge).toBe(MAP_EDGE.north);
    expect(label(STRANGLETHORN, "Duskwood").edge).toBe(MAP_EDGE.north);
    expect(label(STRANGLETHORN, "Westfall").along).toBeLessThan(label(STRANGLETHORN, "Duskwood").along);
    expect(label(ELWYNN, "Redridge Mountains")).toMatchObject({ edge: MAP_EDGE.east, text: "Redridge Mountains →" });
    expect(label(DUN_MOROGH, "Wetlands").edge).toBe(MAP_EDGE.north);
  });

  it("aims in picture pixels", () => {
    expect(edgeToward({ x: 50, y: 50 }, { x: 50, y: 10 })).toEqual({ edge: MAP_EDGE.north, along: 50 });
    expect(edgeToward({ x: 50, y: 50 }, { x: 90, y: 50 })).toEqual({ edge: MAP_EDGE.east, along: 50 });
    // 45° on screen from the middle of a 3:2 picture leaves through the bottom, not the corner.
    expect(edgeToward({ x: 50, y: 50 }, { x: 60, y: 65 }).edge).toBe(MAP_EDGE.south);
  });
});

describe("laying labels out in the band", () => {
  it("keeps a label where it wants to be when there is room", () => {
    expect(layoutEdge([{ centre: 100, length: 60 }], 400)).toEqual([{ start: 70, length: 60 }]);
  });

  it("clamps a label inside the band", () => {
    expect(layoutEdge([{ centre: 5, length: 60 }], 400)).toEqual([{ start: 0, length: 60 }]);
    expect(layoutEdge([{ centre: 399, length: 60 }], 400)).toEqual([{ start: 340, length: 60 }]);
  });

  it("pushes colliding labels apart, keeping their order", () => {
    const [a, b, c] = layoutEdge(
      [
        { centre: 380, length: 100 },
        { centre: 370, length: 100 },
        { centre: 390, length: 100 },
      ],
      400,
    );
    expect(b.start + b.length).toBeLessThanOrEqual(a.start);
    expect(a.start + a.length).toBeLessThanOrEqual(c.start);
    expect(c.start + c.length).toBeLessThanOrEqual(400);
  });

  it("shares a band too short for everyone, shortening only the long labels", () => {
    const slots = layoutEdge(
      [
        { centre: 50, length: 40 },
        { centre: 60, length: 300 },
        { centre: 70, length: 300 },
      ],
      300,
    );
    expect(slots[0].length).toBe(40);
    const total = slots.reduce((sum, s) => sum + s.length, 0);
    expect(total).toBeLessThanOrEqual(300 - 2 * 4);
    expect(Math.max(...slots.map((s) => s.start + s.length))).toBeLessThanOrEqual(300);
  });
});

function intersects(a: FrameRect, b: FrameRect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

describe("every zone map's labels", () => {
  // Picture widths from a phone to a wide side-by-side layout (the picture is 3:2).
  const WIDTHS = [300, 440, 600, 900] as const;
  const zoneMaps = [...data.maps.values()].filter(isZoneView);

  it.each(WIDTHS)("never overlap each other or the map picture at %ipx", (width) => {
    const size = { width, height: (width * 2) / 3 };
    const picture: FrameRect = { left: EDGE_BAND_PX, top: EDGE_BAND_PX, width: size.width, height: size.height };
    const frame: FrameRect = { left: 0, top: 0, width: size.width + 2 * EDGE_BAND_PX, height: size.height + 2 * EDGE_BAND_PX };
    for (const map of zoneMaps) {
      const placed = layoutEdgeLabels(neighbourLabels(data, map.id), size, (l) => estimateLabelLength(l.text));
      const rects = placed.map((p) => ({ name: p.label.target.name, rect: frameRect(p, size) }));
      for (const { name, rect } of rects) {
        const where = `${map.name}: ${name}`;
        expect(intersects(rect, picture), `${where} covers the map`).toBe(false);
        expect(rect.left, where).toBeGreaterThanOrEqual(frame.left);
        expect(rect.top, where).toBeGreaterThanOrEqual(frame.top);
        expect(rect.left + rect.width, where).toBeLessThanOrEqual(frame.width + 0.001);
        expect(rect.top + rect.height, where).toBeLessThanOrEqual(frame.height + 0.001);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(intersects(rects[i].rect, rects[j].rect), `${map.name}: ${rects[i].name} / ${rects[j].name}`).toBe(false);
        }
      }
    }
  });
});
