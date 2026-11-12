/// <reference types="node" />
import fs from "fs";
import path from "path";
import { listRouteFiles } from "@platform/mobile/test-support/listRouteFiles";
import { parse } from "yaml";
import { MORE_MENU } from "../src/constants/moreMenu";
import { TABS } from "../src/constants/tabs";
import { APP_ROUTES } from "../test-support/renderApp";
import type { ScreenMap } from "@platform/mobile/test-support/types/ScreenMap";

const SCREEN_MAP = parse(fs.readFileSync(path.join(__dirname, "..", "screen-map.yaml"), "utf8")) as ScreenMap;
const ROUTES = Object.entries(SCREEN_MAP.routes);
const MORE_WEB_PATHS = MORE_MENU.flatMap((group) => group.items.flatMap((item) => (item.webPath ? [item.webPath] : [])));

describe("the app the tests render", () => {
  it("is every route file under app/, so no screen goes untested", () => {
    expect(Object.keys(APP_ROUTES).sort()).toEqual(listRouteFiles(path.join(__dirname, "..", "app")).sort());
  });

  it("has a route file for every tab", () => {
    expect(TABS.map((tab) => `(app)/(tabs)/${tab.name}`).filter((route) => !(route in APP_ROUTES))).toEqual([]);
  });
});

describe("screen-map.yaml", () => {
  it("gives every route exactly one of a screen or a reason it is not on the phone", () => {
    const unclear = ROUTES.filter(([, route]) => Number(Boolean(route.screen)) + Number(Boolean(route.not_on_mobile)) !== 1).map(
      ([route]) => route,
    );
    expect(unclear).toEqual([]);
  });

  it.each(ROUTES.flatMap(([route, { screen }]) => (screen ? [[route, screen] as const] : [])))(
    "%s is a screen the app opens",
    (_route, screen) => {
      expect(Object.keys(APP_ROUTES)).toContain(screen);
    },
  );

  it("links More only to pages the website has", () => {
    const missing = MORE_WEB_PATHS.filter((webPath) => !(webPath in SCREEN_MAP.routes));
    expect(missing).toEqual([]);
  });

  it("sends every page that isn't built yet somewhere: a tab or a link on More", () => {
    const linked = new Set<string>([
      ...MORE_WEB_PATHS,
      ...TABS.map((tab) => tab.webPath),
    ]);
    const unreachable = ROUTES.filter(
      ([route, { not_on_mobile }]) => not_on_mobile === "Not built yet." && !route.includes(":") && route !== "/" && !linked.has(route),
    ).map(([route]) => route);
    expect(unreachable).toEqual([]);
  });
});
