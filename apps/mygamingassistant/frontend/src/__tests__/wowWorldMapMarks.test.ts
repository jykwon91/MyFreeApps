import { describe, expect, it } from "vitest";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import travelJson from "@/games/wow-forever/data/worldMap/travel.json";
import servicesJson from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import questsJson from "@/games/wow-forever/data/worldMap/classic/classicQuests.json";
import dungeonsJson from "@/games/wow-forever/data/worldMap/classic/classicDungeons.json";
import masksJson from "@/games/wow-forever/data/worldMap/mapMasks.json";
import { DEFAULT_MAP_LAYERS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import { MAP_LAYER_IDS } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { MAP_LAYER_SHARE_CODES } from "@/games/wow-forever/data/worldMap/mapLayerShareCodes";
import {
  MAX_MAP_VIEW_FRAGMENT_LENGTH,
  MAX_MARK_LABEL_LENGTH,
  MAX_MARKS_PER_MAP,
  MAX_MARKS_TOTAL,
  MAX_ROUTE_STOPS,
} from "@/games/wow-forever/data/worldMap/mapMarks";
import { MAP_MARK_STYLE, MAP_MARK_STYLES } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import { cleanUserText } from "@/games/wow-forever/lib/cleanUserText";
import type { MapMark } from "@/games/wow-forever/types/mapMarks/mapMark";
import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";
import type { MapMarksStore } from "@/games/wow-forever/types/mapMarks/mapMarksStore";
import type { SharedMapView } from "@/games/wow-forever/types/mapMarks/sharedMapView";
import { decodeWorldMap } from "@/games/wow-forever/worldMap/decodeWorldMap";
import {
  EMPTY_MAP_MARKS_STORE,
  addMark,
  addToRoute,
  clearRoute,
  deleteMark,
  marksOn,
  moveRouteStop,
  parseMapMarksStore,
  removeRouteStop,
  restoreMapMarks,
  roomForMarks,
  routeMarks,
  saveSharedMarks,
  savedSharedMessage,
  updateMark,
} from "@/games/wow-forever/worldMap/mapMarks";
import { decodeMapViewFragment, encodeMapViewFragment, isMapViewFragment, mapViewShareUrl } from "@/games/wow-forever/worldMap/mapViewShare";
import { formatMapCoords, routeDistance } from "@/games/wow-forever/worldMap/routeDistance";

const data = decodeWorldMap({
  zones: zonesJson,
  travel: travelJson,
  services: servicesJson,
  quests: questsJson,
  dungeons: dungeonsJson,
  masks: masksJson,
});

const ELWYNN = 1429;
const WESTFALL = 1436;

function mark(id: string, x: number, y: number, label = id): MapMark {
  return { id, x, y, label, style: MAP_MARK_STYLE.pin };
}

function storeWith(...marks: MapMark[]): MapMarksStore {
  return marks.reduce((s, m) => addMark(s, ELWYNN, m), EMPTY_MAP_MARKS_STORE);
}

let counter = 0;
const makeId = () => `n${(counter += 1)}`;

describe("marks", () => {
  it("adds, renames, restyles and deletes, cleaning what's typed", () => {
    let s = storeWith(mark("a", 42.345, 120, "  Hogger‮  camp\n "));
    expect(marksOn(s, ELWYNN).marks[0]).toEqual({ id: "a", x: 42.3, y: 100, label: "Hogger camp", style: "pin" });
    s = updateMark(s, ELWYNN, "a", { label: "x".repeat(80), style: MAP_MARK_STYLE.rare });
    expect(marksOn(s, ELWYNN).marks[0].label).toHaveLength(MAX_MARK_LABEL_LENGTH);
    expect(marksOn(s, ELWYNN).marks[0].style).toBe("rare");
    // An empty name falls back to the style's own.
    s = updateMark(s, ELWYNN, "a", { label: "   " });
    expect(marksOn(s, ELWYNN).marks[0].label).toBe("Rare spawn");
    s = deleteMark(s, ELWYNN, "a");
    expect(s.maps[ELWYNN]).toBeUndefined();
  });

  it("keeps marks per map", () => {
    const s = addMark(storeWith(mark("a", 1, 1)), WESTFALL, mark("b", 2, 2));
    expect(marksOn(s, ELWYNN).marks.map((m) => m.id)).toEqual(["a"]);
    expect(marksOn(s, WESTFALL).marks.map((m) => m.id)).toEqual(["b"]);
  });

  it("refuses marks past the per-map and overall caps", () => {
    let s = EMPTY_MAP_MARKS_STORE;
    for (let i = 0; i < MAX_MARKS_PER_MAP + 3; i += 1) s = addMark(s, ELWYNN, mark(`m${i}`, i, i));
    expect(marksOn(s, ELWYNN).marks).toHaveLength(MAX_MARKS_PER_MAP);
    expect(roomForMarks(s, ELWYNN)).toBe(0);
    let all = EMPTY_MAP_MARKS_STORE;
    for (let map = 1; map <= 10; map += 1) {
      for (let i = 0; i < MAX_MARKS_PER_MAP; i += 1) all = addMark(all, map, mark(`m${map}x${i}`, i, i));
    }
    expect(Object.values(all.maps).reduce((n, m) => n + m.marks.length, 0)).toBe(MAX_MARKS_TOTAL);
    expect(roomForMarks(all, 99)).toBe(0);
  });
});

describe("route", () => {
  const base = storeWith(mark("a", 10, 10), mark("b", 20, 20), mark("c", 30, 30));

  it("chains marks once each, reorders, removes and clears", () => {
    let s = ["a", "b", "c", "a", "nope"].reduce((acc, id) => addToRoute(acc, ELWYNN, id), base);
    expect(marksOn(s, ELWYNN).route).toEqual(["a", "b", "c"]);
    s = moveRouteStop(s, ELWYNN, 2, -1);
    expect(marksOn(s, ELWYNN).route).toEqual(["a", "c", "b"]);
    expect(moveRouteStop(s, ELWYNN, 0, -1)).toBe(s);
    expect(moveRouteStop(s, ELWYNN, 2, 1)).toBe(s);
    s = removeRouteStop(s, ELWYNN, 0);
    expect(routeMarks(marksOn(s, ELWYNN)).map((m) => m.id)).toEqual(["c", "b"]);
    // Deleting a mark takes its stop with it.
    s = deleteMark(s, ELWYNN, "b");
    expect(marksOn(s, ELWYNN).route).toEqual(["c"]);
    s = clearRoute(s, ELWYNN);
    expect(marksOn(s, ELWYNN).route).toEqual([]);
  });

  it("stops at the stop cap", () => {
    let s = EMPTY_MAP_MARKS_STORE;
    for (let i = 0; i < MAX_MARKS_PER_MAP; i += 1) s = addToRoute(addMark(s, ELWYNN, mark(`m${i}`, i, i)), ELWYNN, `m${i}`);
    expect(marksOn(s, ELWYNN).route).toHaveLength(MAX_ROUTE_STOPS);
  });

  it("undo puts a map back exactly", () => {
    const before = marksOn(addToRoute(base, ELWYNN, "a"), ELWYNN);
    const after = restoreMapMarks(deleteMark(base, ELWYNN, "a"), ELWYNN, before);
    expect(marksOn(after, ELWYNN)).toEqual(before);
  });

  it("measures straight-line yards on a zone map", () => {
    const elwynn = data.maps.get(ELWYNN)!;
    const stops = [mark("a", 20, 50), mark("b", 50, 50), mark("c", 50, 80)];
    const d = routeDistance(elwynn, stops);
    expect(d.legs).toHaveLength(2);
    expect(d.legs.every((l) => l !== null && l > 0)).toBe(true);
    expect(d.total).toBeCloseTo((d.legs[0] ?? 0) + (d.legs[1] ?? 0));
    expect(routeDistance(elwynn, stops.slice(0, 1)).total).toBeNull();
    // A map that can't place points has no yards, never a made-up number.
    expect(routeDistance({ ...elwynn, regions: [] }, stops)).toEqual({ legs: [null, null], total: null });
  });

  it("formats coordinates the way players paste them", () => {
    expect(formatMapCoords(42.34, 65.06)).toBe("42.3, 65.1");
  });
});

describe("stored marks", () => {
  it("round-trips and re-validates", () => {
    const s = addToRoute(storeWith(mark("a", 1, 2), mark("b", 3, 4)), ELWYNN, "b");
    expect(parseMapMarksStore(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("drops anything malformed or hostile", () => {
    const raw = {
      maps: {
        [ELWYNN]: {
          marks: [
            { id: "ok", x: 5, y: 5, label: "<img src=x onerror=alert(1)>", style: "pin" },
            { id: "ok", x: 6, y: 6, label: "duplicate id", style: "pin" },
            { id: "bad id!", x: 1, y: 1, label: "x", style: "pin" },
            { id: "nan", x: Number.NaN, y: 1, label: "x", style: "pin" },
            { id: "str", x: "5", y: 1, label: "x", style: "pin" },
            { id: "weird", x: 500, y: -3, label: 12, style: "javascript" },
            null,
            "mark",
          ],
          route: ["ok", "ok", "ghost", 7, "weird"],
        },
        "-1": { marks: [{ id: "a", x: 1, y: 1, label: "x", style: "pin" }], route: [] },
        "1.5": { marks: [{ id: "a", x: 1, y: 1, label: "x", style: "pin" }], route: [] },
        abc: { marks: [{ id: "a", x: 1, y: 1, label: "x", style: "pin" }], route: [] },
      },
    };
    const parsed = parseMapMarksStore(raw);
    expect(Object.keys(parsed?.maps ?? {})).toEqual([String(ELWYNN)]);
    const marks = parsed!.maps[ELWYNN];
    // Labels stay as plain text — rendering treats them as text nodes.
    expect(marks.marks).toEqual([
      { id: "ok", x: 5, y: 5, label: "<img src=x onerror=alert(1)>", style: "pin" },
      { id: "weird", x: 100, y: 0, label: "Mark", style: "pin" },
    ]);
    expect(marks.route).toEqual(["ok", "weird"]);
    expect(parseMapMarksStore(null)).toBeNull();
    expect(parseMapMarksStore({ maps: 3 })).toBeNull();
    expect(parseMapMarksStore([])).toBeNull();
  });
});

describe("saving shared marks", () => {
  const shared: MapMarks = { marks: [mark("s0", 10, 10, "Hogger"), mark("s1", 20, 20, "Camp")], route: ["s1", "s0"] };

  it("adds them as yours with the shared route when you have none", () => {
    const result = saveSharedMarks(EMPTY_MAP_MARKS_STORE, ELWYNN, shared, makeId);
    expect(result).toMatchObject({ added: 2, duplicates: 0, noRoom: 0 });
    const mine = marksOn(result.store, ELWYNN);
    expect(mine.marks.map((m) => m.label)).toEqual(["Hogger", "Camp"]);
    expect(routeMarks(mine).map((m) => m.label)).toEqual(["Camp", "Hogger"]);
    expect(mine.marks.some((m) => m.id.startsWith("s"))).toBe(false);
  });

  it("never replaces your marks or your route, and skips ones you already have", () => {
    const own = addToRoute(storeWith(mark("mine", 10, 10, "Hogger"), mark("other", 50, 50, "Mine")), ELWYNN, "other");
    const result = saveSharedMarks(own, ELWYNN, shared, makeId);
    expect(result).toMatchObject({ added: 1, duplicates: 1 });
    const mine = marksOn(result.store, ELWYNN);
    expect(mine.marks.map((m) => m.label)).toEqual(["Hogger", "Mine", "Camp"]);
    expect(mine.marks[0].id).toBe("mine");
    expect(mine.route).toEqual(["other"]);
  });

  it("counts what didn't fit on a full map", () => {
    let full = EMPTY_MAP_MARKS_STORE;
    for (let i = 0; i < MAX_MARKS_PER_MAP - 1; i += 1) full = addMark(full, ELWYNN, mark(`m${i}`, i, 90));
    const result = saveSharedMarks(full, ELWYNN, shared, makeId);
    expect(result).toMatchObject({ added: 1, noRoom: 1 });
    expect(savedSharedMessage(result)).toBe("Saved 1 mark to your marks. 1 mark didn't fit — this map is full.");
  });

  it("says so when everything was already yours", () => {
    expect(savedSharedMessage({ added: 0, duplicates: 2, noRoom: 0 })).toBe("No new marks to save. 2 were already yours.");
  });
});

describe("share link", () => {
  const view: SharedMapView = {
    mapId: ELWYNN,
    viewport: { scale: 2.5, centerX: 0.42, centerY: 0.655 },
    layers: { ...DEFAULT_MAP_LAYERS },
    marks: {
      marks: [
        { id: "a", x: 42.3, y: 65.1, label: "Hogger ~ the_gnoll! (it's *big*)", style: MAP_MARK_STYLE.rare },
        { id: "b", x: 50, y: 50, label: "Meet ☕ here 100%", style: MAP_MARK_STYLE.meet },
        { id: "c", x: 0, y: 100, label: "Edge", style: MAP_MARK_STYLE.danger },
      ],
      route: ["c", "a"],
    },
  };

  it("round-trips the map, view, layers, marks and route", () => {
    const fragment = encodeMapViewFragment(view);
    expect(fragment).toMatch(/^view=1~1429~250\.420\.655~/);
    expect(fragment).not.toMatch(/[ !'()*]/);
    const back = decodeMapViewFragment(`#${fragment}`);
    expect(back?.mapId).toBe(ELWYNN);
    expect(back?.viewport).toEqual(view.viewport);
    expect(back?.layers).toEqual(view.layers);
    expect(back?.marks.marks.map(({ x, y, label, style }) => ({ x, y, label, style }))).toEqual(
      view.marks.marks.map(({ x, y, label, style }) => ({ x, y, label, style })),
    );
    expect(routeMarks(back!.marks).map((m) => m.label)).toEqual(["Edge", view.marks.marks[0].label]);
    expect(isMapViewFragment(`#${fragment}`)).toBe(true);
  });

  it("puts the map in the query and the view in the fragment", () => {
    const url = mapViewShareUrl("https://example.test", view);
    expect(url.startsWith("https://example.test/wow-forever/map?m=1429#view=1~1429~")).toBe(true);
  });

  it("survives an app escaping the link once", () => {
    const fragment = encodeMapViewFragment(view);
    const value = fragment.slice("view=".length);
    expect(decodeMapViewFragment(`#view=${value.split("~").join("%7E")}`)?.marks.marks).toHaveLength(3);
    expect(decodeMapViewFragment(`#view=${encodeURIComponent(value)}`)?.marks.marks[0].label).toBe(view.marks.marks[0].label);
  });

  it("gives every layer a unique share code", () => {
    const codes = MAP_LAYER_IDS.map((id) => MAP_LAYER_SHARE_CODES[id]);
    expect(new Set(codes).size).toBe(MAP_LAYER_IDS.length);
    expect(codes.every((c) => /^[a-z]{2}$/.test(c))).toBe(true);
    expect(new Set(MAP_MARK_STYLES.map((s) => s.code)).size).toBe(MAP_MARK_STYLES.length);
  });

  it.each([
    ["empty", ""],
    ["no prefix", "#list=1~a"],
    ["wrong version", "#view=2~1429~100.500.500~~~"],
    ["too few fields", "#view=1~1429~100.500.500~~"],
    ["too many fields", "#view=1~1429~100.500.500~~~~"],
    ["map id not digits", "#view=1~abc~100.500.500~~~"],
    ["map id zero", "#view=1~0~100.500.500~~~"],
    ["map id negative", "#view=1~-5~100.500.500~~~"],
    ["map id huge", "#view=1~123456789~100.500.500~~~"],
    ["view not three numbers", "#view=1~1429~100.500~~~"],
    ["view with junk", "#view=1~1429~1e3.500.500~~~"],
    ["bad percent sequence", "#view=%E0%A4%A"],
    ["oversized", `#view=1~1429~100.500.500~~${"500,500,p,x_".repeat(MAX_MAP_VIEW_FRAGMENT_LENGTH)}~`],
  ])("refuses a %s link", (_name, hash) => {
    expect(decodeMapViewFragment(hash)).toBeNull();
  });

  it("clamps the view and ignores unknown layers", () => {
    const v = decodeMapViewFragment("#view=1~1429~9999.5000.0~fm.zz.<script>~~");
    expect(v?.viewport).toEqual({ scale: 4, centerX: 1, centerY: 0 });
    expect(Object.entries(v!.layers).filter(([, on]) => on).map(([id]) => id)).toEqual(["flight_masters"]);
  });

  it("skips malformed marks and drops route stops that don't point at a kept one", () => {
    const marks = [
      "100,100,p,Fine",
      "1001,5,p,TooFarRight",
      "5,5,p",
      "5,5,p,%E0%A4%A",
      "-5,5,p,Neg",
      "5,5,zz,Unknown%20style",
      "5,5,p,%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "5,5,p,%E2%80%AEevil%E2%80%AC%00%0Aline",
      `5,5,p,${"a".repeat(200)}`,
      "5,5,p,",
    ].join("_");
    const v = decodeMapViewFragment(`#view=1~1429~100.500.500~~${marks}~0.0.1.2.5.6.99.x.-1`);
    expect(v?.marks.marks.map((m) => m.label)).toEqual([
      "Fine",
      "Unknown style",
      "<script>alert(1)</script>",
      "evil line",
      "a".repeat(MAX_MARK_LABEL_LENGTH),
      "Mark",
    ]);
    expect(v?.marks.marks[1].style).toBe("pin");
    expect(v?.marks.route).toEqual(["s0", "s5", "s6"]);
  });

  it("keeps only the first 30 marks and 25 stops", () => {
    const rows = Array.from({ length: 50 }, (_, i) => `${i},${i},p,m${i}`).join("_");
    const stops = Array.from({ length: 50 }, (_, i) => i).join(".");
    const v = decodeMapViewFragment(`#view=1~1429~100.500.500~~${rows}~${stops}`);
    expect(v?.marks.marks).toHaveLength(MAX_MARKS_PER_MAP);
    expect(v?.marks.route).toHaveLength(MAX_ROUTE_STOPS);
  });

  it("fits the largest view we can make under the length limit, even encoded again by an app", () => {
    const label = "🗡".repeat(MAX_MARK_LABEL_LENGTH);
    const marks = Array.from({ length: MAX_MARKS_PER_MAP }, (_, i): MapMark => ({
      id: `m${i}`,
      x: 99.9,
      y: 99.9,
      label,
      style: MAP_MARK_STYLE.meet,
    }));
    const biggest: SharedMapView = {
      ...view,
      layers: Object.fromEntries(MAP_LAYER_IDS.map((id) => [id, true])) as SharedMapView["layers"],
      marks: { marks, route: marks.slice(0, MAX_ROUTE_STOPS).map((m) => m.id) },
    };
    const value = encodeMapViewFragment(biggest).slice("view=".length);
    const encodedAgain = encodeURIComponent(value);
    expect(`view=${encodedAgain}`.length).toBeLessThanOrEqual(MAX_MAP_VIEW_FRAGMENT_LENGTH);
    for (const hash of [`#view=${value}`, `#view=${encodedAgain}`]) {
      const back = decodeMapViewFragment(hash);
      expect(back?.marks.marks).toHaveLength(MAX_MARKS_PER_MAP);
      expect(back?.marks.marks[0].label).toBe(label);
      expect(back?.marks.route).toHaveLength(MAX_ROUTE_STOPS);
    }
  });
});

describe("cleanUserText", () => {
  it("drops hidden characters, turns any whitespace into one space and counts characters, not UTF-16 units", () => {
    expect(cleanUserText("a​⁦b\tc\u0007  d", 40)).toBe("ab c d");
    expect(cleanUserText("two\nlines\r\nhere", 40)).toBe("two lines here");
    expect(cleanUserText("soft­hyphen﻿", 40)).toBe("softhyphen");
    expect(cleanUserText("😀😀😀", 2)).toBe("😀😀");
    expect(cleanUserText(" ‏ ", 10)).toBe("");
  });
});
