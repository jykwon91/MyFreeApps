/// <reference types="node" />
import fs from "fs";
import path from "path";
import { listRouteFiles } from "@platform/mobile/test-support/listRouteFiles";
import type { ScreenMap } from "@platform/mobile/test-support/types/ScreenMap";
import { parse } from "yaml";
import { SETTINGS_MENU } from "../src/constants/settingsMenu";
import { TABS } from "../src/constants/tabs";
import { APP_ROUTES } from "../test-support/renderApp";

const SCREEN_MAP = parse(fs.readFileSync(path.join(__dirname, "..", "screen-map.yaml"), "utf8")) as ScreenMap;
const ROUTES = Object.entries(SCREEN_MAP.routes);
/** Pages no tab or link opens, because the website reaches them only from another page. */
const REACHED_IN_FLOW: Record<string, string> = {
  "/practice": "Needs a scenario, chosen on /scenarios (the Practice tab).",
};
const SETTINGS_WEB_PATHS = SETTINGS_MENU.flatMap((group) => group.items.flatMap((item) => (item.webPath ? [item.webPath] : [])));

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

  it("links Settings only to pages the website has", () => {
    const missing = SETTINGS_WEB_PATHS.filter((webPath) => !(webPath in SCREEN_MAP.routes));
    expect(missing).toEqual([]);
  });

  it("sends every page that isn't built yet somewhere: a tab, a link on Settings, or a step in the practice flow", () => {
    const linked = new Set<string>([...SETTINGS_WEB_PATHS, ...TABS.map((tab) => tab.webPath), ...Object.keys(REACHED_IN_FLOW)]);
    const unreachable = ROUTES.filter(
      ([route, { not_on_mobile }]) => not_on_mobile === "Not built yet." && !route.includes(":") && route !== "/" && !linked.has(route),
    ).map(([route]) => route);
    expect(unreachable).toEqual([]);
  });

  it("only excuses flow steps the website still has and the phone hasn't built", () => {
    const stale = Object.keys(REACHED_IN_FLOW).filter((route) => SCREEN_MAP.routes[route]?.not_on_mobile !== "Not built yet.");
    expect(stale).toEqual([]);
  });
});
