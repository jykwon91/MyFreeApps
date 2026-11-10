import api from "@platform/core/lib/api";
import { act, screen } from "@testing-library/react-native";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";
import { serveRole, serveRoleLater } from "../test-support/serveRole";
import { listRouteFiles } from "../test-support/listRouteFiles";
import { WRITE_GUARD_EXEMPTIONS, WRITE_ONLY_ROUTES } from "../test-support/writeOnlyRoutes";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  usePreventRemove: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const originalAdapter = api.defaults.adapter;
/** The buttons a form or a picker ends in; a viewer's view-only state may only offer a way back. */
const FORM_BUTTON = /^(save|add|create|send|import|continue|submit|next|choose|promote|make|record|upload|email|reply)/i;
const CASES = WRITE_ONLY_ROUTES.map((entry) => [entry.route, entry] as const);

beforeEach(() => resetSignedInStore());
afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function hasForm(): boolean {
  return JSON.stringify(screen.toJSON()).includes('"type":"TextInput"') || screen.queryAllByRole("button", { name: FORM_BUTTON }).length > 0;
}

function hasSkeleton(): boolean {
  return JSON.stringify(screen.toJSON()).includes('"importantForAccessibility":"no-hide-descendants"');
}

describe("every create and edit route turns a viewer away itself", () => {
  it.each(CASES)("%s shows a viewer its view-only heading, no form, and asks the server for nothing", async (_route, entry) => {
    const requests = serveRole("viewer");
    await renderScreen(entry.screen);
    expect(await screen.findByRole("header", { name: entry.heading })).toBeTruthy();
    expect(hasForm()).toBe(false);
    expect(hasSkeleton()).toBe(false);
    expect(requests).toEqual([]);
  });

  it.each(CASES)("%s shows a skeleton, not the message or a form, and asks for nothing while the role is loading", async (_route, entry) => {
    const later = serveRoleLater("viewer");
    await renderScreen(entry.screen);
    expect(hasSkeleton()).toBe(true);
    expect(screen.queryByRole("header", { name: entry.heading })).toBeNull();
    expect(hasForm()).toBe(false);
    expect(later.requests).toEqual([]);

    await act(async () => later.release());
    expect(await screen.findByRole("header", { name: entry.heading })).toBeTruthy();
    expect(later.requests).toEqual([]);
  });
});

describe("the list of write-only routes", () => {
  const NAMES_A_WRITE_ROUTE = /(^|\/)(new|edit|import|reply|promote|add|add-document|turn-on|override|camera|capture)(\/|$)/;
  const guarded = new Set(WRITE_ONLY_ROUTES.map((entry) => entry.route));
  const routeFiles = listRouteFiles();

  it("names real route files", () => {
    expect([...guarded, ...Object.keys(WRITE_GUARD_EXEMPTIONS)].filter((route) => !routeFiles.includes(route))).toEqual([]);
  });

  it("covers every route whose name says it creates or edits, or says why not", () => {
    const unaccountedFor = routeFiles.filter((route) => NAMES_A_WRITE_ROUTE.test(route) && !guarded.has(route) && !(route in WRITE_GUARD_EXEMPTIONS));
    expect(unaccountedFor).toEqual([]);
  });

  it("gives every exemption a reason and keeps it out of the guarded list", () => {
    for (const [route, reason] of Object.entries(WRITE_GUARD_EXEMPTIONS)) {
      expect(reason.length).toBeGreaterThan(10);
      expect(guarded.has(route)).toBe(false);
    }
  });
});
