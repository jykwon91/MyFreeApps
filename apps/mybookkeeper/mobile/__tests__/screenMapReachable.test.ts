/// <reference types="node" />
import fs from "fs";
import path from "path";
import { parse } from "yaml";
import type { ScreenMap } from "@platform/mobile/test-support/types/ScreenMap";
import { ALL_DESTINATIONS } from "../src/constants/allDestinations";

const SCREEN_MAP = parse(fs.readFileSync(path.join(__dirname, "..", "screen-map.yaml"), "utf8")) as ScreenMap;

/** "(app)/(tabs)/people" becomes "/people"; "(app)/tax/index" becomes "/tax". */
function hrefOf(screenFile: string): string {
  const parts = screenFile.split("/").filter((part) => !/^\(.*\)$/.test(part) && part !== "index");
  return `/${parts.join("/")}`;
}

const REACHABLE = new Set(
  ALL_DESTINATIONS.flatMap((group) =>
    group.items.flatMap((item) => (typeof item.screen === "string" ? [item.screen.split("?")[0]] : [])),
  ),
);

// A route with a parameter is opened from its list, and sign-in is before the app.
const entries = Object.entries(SCREEN_MAP.routes).flatMap(([route, { screen }]) =>
  screen && !route.includes(":") && screen !== "sign-in" ? [[route, screen] as const] : [],
);

describe("screen-map.yaml against the All screen", () => {
  it("gives every route exactly one of a screen or a reason it is not on the phone", () => {
    const unclear = Object.entries(SCREEN_MAP.routes)
      .filter(([, route]) => Number(Boolean(route.screen)) + Number(Boolean(route.not_on_mobile)) !== 1)
      .map(([route]) => route);
    expect(unclear).toEqual([]);
  });

  it.each(entries)("%s is reachable from the All screen or a tab", (_route, screenFile) => {
    expect(REACHABLE).toContain(hrefOf(screenFile));
  });

  it("lists only screens the app has", () => {
    const missing = [...REACHABLE].filter((href) => {
      const dir = path.join(__dirname, "..", "app", "(app)");
      const candidates = [href === "/" ? "(tabs)/index" : `${href.slice(1)}`, `(tabs)/${href.slice(1)}`];
      return !candidates.some((c) =>
        [".tsx", "/index.tsx"].some((ext) => fs.existsSync(path.join(dir, `${c}${ext}`))),
      );
    });
    expect(missing).toEqual([]);
  });
});
