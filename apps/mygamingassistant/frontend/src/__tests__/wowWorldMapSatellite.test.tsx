import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MapStyleToggle from "@/games/wow-forever/components/worldMap/MapStyleToggle";
import dataRefresh from "@/games/wow-forever/data/dataRefresh.json";
import { MAP_STYLE, MAP_STYLE_STORAGE_KEY, SATELLITE_BASE } from "@/games/wow-forever/data/worldMap/mapStyle";
import { SATELLITE_MAPS } from "@/games/wow-forever/data/worldMap/satelliteMaps";
import zonesJson from "@/games/wow-forever/data/worldMap/zones.json";
import { useSatelliteView } from "@/games/wow-forever/hooks/useSatelliteView";
import { parseMapStyle, satelliteUrl } from "@/games/wow-forever/worldMap/mapStyle";

const ELWYNN = 1429;
const AZEROTH = 947;
const EASTERN_KINGDOMS = 1415;
const IRONFORGE = 1455;
const UNDERCITY = 1458;

afterEach(() => window.localStorage.clear());

describe("parseMapStyle", () => {
  it("takes the two styles", () => {
    expect(parseMapStyle("drawn")).toBe(MAP_STYLE.drawn);
    expect(parseMapStyle("satellite")).toBe(MAP_STYLE.satellite);
  });

  it.each([null, undefined, "", "Satellite", "map", 1, {}, ["satellite"]])("rejects %j", (raw) => {
    expect(parseMapStyle(raw)).toBeNull();
  });
});

describe("satellite manifest", () => {
  it("is for the pinned client build", () => {
    expect(SATELLITE_MAPS.build).toBe(dataRefresh.clientBuild);
  });

  it("is twice the drawn art's size, same shape", () => {
    expect(SATELLITE_MAPS.width).toBe(2004);
    expect(SATELLITE_MAPS.height).toBe(1336);
  });

  it("lists only zone and city maps that exist", () => {
    const kinds = new Map(zonesJson.zones.map((z) => [z.id, z.kind]));
    for (const id of SATELLITE_MAPS.maps) expect(kinds.get(id)).toMatch(/^(zone|city)$/);
    expect(SATELLITE_MAPS.maps.length).toBeGreaterThan(40);
  });

  it("leaves the world, continents and the underground capitals drawn-only", () => {
    for (const id of [AZEROTH, EASTERN_KINGDOMS, IRONFORGE, UNDERCITY]) {
      expect(satelliteUrl(SATELLITE_MAPS, id)).toBeNull();
    }
  });

  it("points a zone at the same-origin API", () => {
    expect(satelliteUrl(SATELLITE_MAPS, ELWYNN)).toBe(`${SATELLITE_BASE}/${SATELLITE_MAPS.build}/${ELWYNN}.webp`);
  });
});

describe("useSatelliteView", () => {
  it("shows the drawn map by default", () => {
    const { result } = renderHook(() => useSatelliteView(ELWYNN));
    expect(result.current.available).toBe(true);
    expect(result.current.src).toBeNull();
    expect(result.current.value).toBe(MAP_STYLE.drawn);
  });

  it("is busy until the picture loads, then shown, and saves the choice", () => {
    const { result } = renderHook(() => useSatelliteView(ELWYNN));
    act(() => result.current.choose(MAP_STYLE.satellite));
    expect(result.current.src).toMatch(/1429\.webp$/);
    expect(result.current.busy).toBe(true);
    expect(result.current.shown).toBe(false);
    act(() => result.current.onLoad());
    expect(result.current.shown).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? "null")).toBe("satellite");
  });

  it("waits for a fresh load after Satellite -> Map -> Satellite", () => {
    const { result } = renderHook(() => useSatelliteView(ELWYNN));
    act(() => result.current.choose(MAP_STYLE.satellite));
    act(() => result.current.onLoad());
    act(() => result.current.choose(MAP_STYLE.drawn));
    expect(result.current.src).toBeNull();
    expect(result.current.shown).toBe(false);
    act(() => result.current.choose(MAP_STYLE.satellite));
    expect(result.current.busy).toBe(true);
    expect(result.current.shown).toBe(false);
  });

  it("falls back to the drawn map when the picture fails, and retries on Satellite", () => {
    const { result } = renderHook(() => useSatelliteView(ELWYNN));
    act(() => result.current.choose(MAP_STYLE.satellite));
    act(() => result.current.onError());
    expect(result.current.failed).toBe(true);
    expect(result.current.src).toBeNull();
    expect(result.current.value).toBe(MAP_STYLE.drawn);
    act(() => result.current.choose(MAP_STYLE.satellite));
    expect(result.current.failed).toBe(false);
    expect(result.current.src).not.toBeNull();
  });

  it("keeps the choice on a map with no satellite view but offers no toggle", () => {
    window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, JSON.stringify("satellite"));
    const { result } = renderHook(() => useSatelliteView(IRONFORGE));
    expect(result.current.available).toBe(false);
    expect(result.current.src).toBeNull();
    expect(result.current.failed).toBe(false);
  });

  it("ignores a stored value that isn't a style", () => {
    window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useSatelliteView(ELWYNN));
    expect(result.current.value).toBe(MAP_STYLE.drawn);
  });
});

describe("MapStyleToggle", () => {
  it("is a radio group with one picked option", () => {
    render(<MapStyleToggle value={MAP_STYLE.drawn} busy={false} onChange={() => {}} onPreload={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Map style" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Map" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Satellite" }).getAttribute("aria-checked")).toBe("false");
  });

  it("changes on click and arrow keys, and preloads on hover", () => {
    const onChange = vi.fn();
    const onPreload = vi.fn();
    render(<MapStyleToggle value={MAP_STYLE.drawn} busy={false} onChange={onChange} onPreload={onPreload} />);
    const satellite = screen.getByRole("radio", { name: "Satellite" });
    fireEvent.pointerEnter(satellite);
    expect(onPreload).toHaveBeenCalled();
    fireEvent.click(satellite);
    expect(onChange).toHaveBeenLastCalledWith(MAP_STYLE.satellite);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(MAP_STYLE.satellite);
  });

  it("marks Satellite busy while it loads", () => {
    render(<MapStyleToggle value={MAP_STYLE.satellite} busy onChange={() => {}} onPreload={() => {}} />);
    expect(screen.getByRole("radio", { name: "Satellite" }).getAttribute("aria-busy")).toBe("true");
  });
});
