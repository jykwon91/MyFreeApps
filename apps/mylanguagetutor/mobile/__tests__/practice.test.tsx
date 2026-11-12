import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import { SESSION_BLOCK_COPY } from "@mylanguagetutor/api-client/constants/sessionBlockCopy";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState, Linking } from "react-native";
import type { AppStateStatus } from "react-native";
import { WEB_BASE_URL } from "../src/constants/api";
import { CATALOG_MESSAGES } from "../src/constants/catalog";
import { store } from "../src/lib/store";
import { renderApp } from "../test-support/renderApp";
import { ONBOARDED_LEARNER_ROUTES, PRACTICE_HEADING } from "../test-support/onboardedLearner";
import { PROFILE, SCENARIOS, USAGE_LEFT, USAGE_USED_UP } from "../test-support/tutorRecords";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
// The store tells the API layer when the app comes back to the foreground, through the listener it adds as it loads.
const changeAppState = jest.mocked(AppState.addEventListener).mock.calls.find(([type]) => type === "change")?.[1] as (state: AppStateStatus) => void;

/** A learner who has onboarded, with Spanish scenarios, plus any overrides. */
function serveCatalog(overrides: Record<string, FakeRoute> = {}): SentRequest[] {
  return serve({
    "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
    ...ONBOARDED_LEARNER_ROUTES,
    ...overrides,
  });
}

/** Answers with `reply` while `isDown()`, and normally after. */
function downWhile(isDown: () => boolean, reply: FakeReply): FakeRoute {
  return () => (isDown() ? { status: 500, data: {} } : reply);
}

// Each test starts from a phone that signed in before, and an empty cache.
beforeEach(() => {
  storedItems.clear();
  storeSession();
  openURL.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

describe("the Practice tab", () => {
  it("lists the scenarios for the learner's language, with their level", async () => {
    const sent = serveCatalog();
    await renderApp();

    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(screen.getByText("Level: I know some phrases")).toBeTruthy();
    expect(screen.getByText(CATALOG_COPY.pickScenario)).toBeTruthy();
    expect(screen.getByRole("link", { name: "1. Greetings Say hello and introduce yourself." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "4. At the cafe Order a drink and a snack." })).toBeTruthy();
    expect(sent.find((request) => request.route === "GET /scenarios")?.params).toEqual({ language: "es" });
    expect(screen.queryByText(SESSION_BLOCK_COPY.daily_limit)).toBeNull();
  });

  it("opens a scenario's practice on the website, until the app has it", async () => {
    serveCatalog();
    await renderApp();

    await fireEvent.press(await screen.findByRole("link", { name: /^4\. At the cafe/ }));
    expect(openURL).toHaveBeenLastCalledWith(`${WEB_BASE_URL}/practice?scenario=cafe`);
  });

  it("says when today's practice is used up, and still lists the scenarios", async () => {
    serveCatalog({ "GET /usage/today": () => ({ status: 200, data: USAGE_USED_UP }) });
    await renderApp();

    expect(await screen.findByText(SESSION_BLOCK_COPY.daily_limit)).toBeTruthy();
    expect(screen.getByRole("link", { name: /^1\. Greetings/ })).toBeTruthy();
  });

  it("checks today's usage again when the learner comes back from practising on the website", async () => {
    let usage = USAGE_LEFT;
    const sent = serveCatalog({ "GET /usage/today": () => ({ status: 200, data: usage }) });
    await renderApp();
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(screen.queryByText(SESSION_BLOCK_COPY.daily_limit)).toBeNull();

    usage = USAGE_USED_UP;
    await act(async () => changeAppState("background"));
    await act(async () => changeAppState("active"));

    expect(await screen.findByText(SESSION_BLOCK_COPY.daily_limit)).toBeTruthy();
    expect(sent.filter((request) => request.route === "GET /usage/today")).toHaveLength(2);
  });

  it("shows placeholder cards while the scenarios load", async () => {
    let answer: (() => void) | undefined;
    serveCatalog({
      "GET /scenarios": () =>
        new Promise<FakeReply>((resolve) => {
          answer = () => resolve({ status: 200, data: SCENARIOS });
        }),
    });
    await renderApp();

    // The profile has loaded and the scenarios are on their way.
    await waitFor(() => expect(answer).toBeDefined());
    expect(screen.getByLabelText(CATALOG_MESSAGES.loadingScenarios)).toBeTruthy();
    expect(screen.getAllByTestId("catalog-skeleton-card")).toHaveLength(4);
    await act(async () => answer?.());
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(screen.queryByLabelText(CATALOG_MESSAGES.loadingScenarios)).toBeNull();
  });

  it("says so when the language has no scenarios", async () => {
    serveCatalog({ "GET /scenarios": () => ({ status: 200, data: [] }) });
    await renderApp();

    expect(await screen.findByRole("header", { name: CATALOG_MESSAGES.noScenariosHeading })).toBeTruthy();
    expect(screen.getByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
  });

  it("changes the level from the Practice tab, and comes back to it showing the new level", async () => {
    const sent = serveCatalog({
      "PUT /profile": (body) => ({ status: 200, data: { ...PROFILE, ...(body as Pick<Profile, "language_code" | "level">) } }),
    });
    await renderApp();

    await fireEvent.press(await screen.findByRole("button", { name: CATALOG_COPY.changeLevel }));
    await waitFor(() => expect(screen).toHavePathname("/onboarding/level"));
    expect(screen).toHaveSearchParams({ language: "es" });
    expect(screen.getByRole("radio", { name: "I know some phrases" })).toBeChecked();
    // Changing the level isn't onboarding, so there's no step count.
    expect(screen.queryByText(ONBOARDING_COPY.levelStep)).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "I can hold a conversation" }));
    await fireEvent.press(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));

    expect(await screen.findByText("Level: I can hold a conversation")).toBeTruthy();
    expect(screen).toHavePathname("/");
    expect(screen.queryByText("Level: I know some phrases")).toBeNull();
    expect(sent.find((request) => request.route === "PUT /profile")?.body).toEqual({ language_code: "es", level: "conversational" });
    // The saved profile goes straight into the cache, with no second load to wait for.
    expect(sent.filter((request) => request.route === "GET /profile")).toHaveLength(1);
    expect(router.canGoBack()).toBe(false);
  });

  it("says when the profile can't load, and tries again", async () => {
    let isDown = true;
    serveCatalog({ "GET /profile": downWhile(() => isDown, { status: 200, data: PROFILE }) });
    await renderApp();

    expect(await screen.findByRole("header", { name: CATALOG_COPY.loadFailed })).toBeTruthy();
    isDown = false;
    await fireEvent.press(screen.getByRole("button", { name: CATALOG_COPY.retry }));
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
  });

  it("says when the scenarios can't load, tries again, and keeps the list when a refresh fails", async () => {
    let isDown = true;
    const sent = serveCatalog({ "GET /scenarios": downWhile(() => isDown, { status: 200, data: SCENARIOS }) });
    await renderApp();

    expect(await screen.findByRole("header", { name: CATALOG_COPY.loadFailed })).toBeTruthy();
    isDown = false;
    await fireEvent.press(screen.getByRole("button", { name: CATALOG_COPY.retry }));
    expect(await screen.findByRole("link", { name: /^1\. Greetings/ })).toBeTruthy();
    expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();

    isDown = true;
    await act(async () => {
      await screen.getByTestId("scenario-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("link", { name: /^1\. Greetings/ })).toBeTruthy();
    expect(sent.filter((request) => request.route === "GET /scenarios")).toHaveLength(3);
  });
});
