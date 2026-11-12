import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { PROFILE_GATE_MESSAGES } from "../src/constants/onboarding";
import { store } from "../src/lib/store";
import { ONBOARDED_LEARNER_ROUTES, PRACTICE_HEADING } from "../test-support/onboardedLearner";
import { renderApp } from "../test-support/renderApp";
import { SCENARIOS, SPANISH, USAGE_LEFT } from "../test-support/tutorRecords";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

/** A learner who hasn't onboarded yet: PUT /profile saves what they choose. */
function serveNewLearner(overrides: Record<string, FakeRoute> = {}): SentRequest[] {
  let profile: Profile | null = null;
  return serve({
    "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
    "GET /profile": () => ({ status: 200, data: profile }),
    "PUT /profile": (body) => {
      profile = { ...(body as Pick<Profile, "language_code" | "level">), updated_at: "2026-11-12T00:00:00Z" };
      return { status: 200, data: profile };
    },
    "GET /languages": () => ({ status: 200, data: [SPANISH] }),
    "GET /scenarios": () => ({ status: 200, data: SCENARIOS }),
    "GET /usage/today": () => ({ status: 200, data: USAGE_LEFT }),
    ...overrides,
  });
}

async function chooseSpanish(): Promise<void> {
  await fireEvent.press(await screen.findByRole("button", { name: "Spanish Latin American" }));
  await waitFor(() => expect(screen).toHavePathname("/onboarding/level"));
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  store.dispatch(baseApi.util.resetApiState());
});

describe("onboarding", () => {
  it("sends a learner with no language or level to the language step", async () => {
    serveNewLearner();
    await renderApp();

    await waitFor(() => expect(screen).toHavePathname("/onboarding/language"));
    expect(await screen.findByText(ONBOARDING_COPY.languageStep)).toBeTruthy();
    expect(screen.getByRole("header", { name: ONBOARDING_COPY.languageHeading })).toBeTruthy();
    expect(screen.getByText(ONBOARDING_COPY.languageIntro)).toBeTruthy();
  });

  it("saves the language and level, then opens that language's scenarios", async () => {
    const sent = serveNewLearner();
    await renderApp();
    await chooseSpanish();

    expect(screen).toHaveSearchParams({ language: "es" });
    expect(screen.getByText(ONBOARDING_COPY.levelStep)).toBeTruthy();
    expect(screen.getByRole("header", { name: ONBOARDING_COPY.levelHeading })).toBeTruthy();
    const continueButton = screen.getByRole("button", { name: ONBOARDING_COPY.continue });
    expect(continueButton).toBeDisabled();

    await fireEvent.press(screen.getByRole("radio", { name: "Just starting" }));
    expect(screen.getByRole("radio", { name: "Just starting" })).toBeChecked();
    await fireEvent.press(continueButton);

    expect(await screen.findByRole("header", { name: "Practice Spanish" })).toBeTruthy();
    expect(screen).toHavePathname("/");
    expect(screen.getByText("Level: Just starting")).toBeTruthy();
    expect(sent.find((request) => request.route === "PUT /profile")?.body).toEqual({ language_code: "es", level: "beginner" });
    // Onboarding is finished: Back doesn't return to it.
    expect(router.canGoBack()).toBe(false);
  });

  it("leaves the learner on the Practice tab with a way back in when they go back from the language step", async () => {
    serveNewLearner();
    await renderApp();
    await waitFor(() => expect(screen).toHavePathname("/onboarding/language"));

    await act(() => router.back());
    expect(await screen.findByRole("header", { name: PROFILE_GATE_MESSAGES.heading })).toBeTruthy();
    expect(screen).toHavePathname("/");

    await fireEvent.press(screen.getByRole("button", { name: PROFILE_GATE_MESSAGES.action }));
    await waitFor(() => expect(screen).toHavePathname("/onboarding/language"));
  });

  it("sends the level step back to the language step when no language was chosen", async () => {
    serveNewLearner();
    await renderApp("/onboarding/level");

    await waitFor(() => expect(screen).toHavePathname("/onboarding/language"));
    expect(await screen.findByRole("header", { name: ONBOARDING_COPY.languageHeading })).toBeTruthy();
  });

  it("sends an empty language back to the language step, as the website does", async () => {
    serve({ "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }), ...ONBOARDED_LEARNER_ROUTES });
    await renderApp("/onboarding/level?language=");

    await waitFor(() => expect(screen).toHavePathname("/onboarding/language"));
    expect(await screen.findByRole("header", { name: ONBOARDING_COPY.languageHeading })).toBeTruthy();
  });

  it("opens a link straight to Change level over the Practice tab", async () => {
    serve({ "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }), ...ONBOARDED_LEARNER_ROUTES });
    await renderApp("/onboarding/level?language=es");

    await waitFor(() => expect(screen.getByRole("radio", { name: "I know some phrases" })).toBeChecked());
    expect(router.canGoBack()).toBe(true);
    await act(() => router.back());
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(screen).toHavePathname("/");
  });

  it("says so when no languages are available yet", async () => {
    serveNewLearner({ "GET /languages": () => ({ status: 200, data: [] }) });
    await renderApp();

    expect(await screen.findByText(CATALOG_COPY.noLanguages)).toBeTruthy();
  });

  it("says when the languages can't load, and tries again", async () => {
    let isDown = true;
    serveNewLearner({ "GET /languages": () => (isDown ? { status: 500, data: {} } : { status: 200, data: [SPANISH] }) });
    await renderApp();

    expect(await screen.findByRole("header", { name: CATALOG_COPY.loadFailed })).toBeTruthy();
    isDown = false;
    await fireEvent.press(screen.getByRole("button", { name: CATALOG_COPY.retry }));
    expect(await screen.findByRole("button", { name: "Spanish Latin American" })).toBeTruthy();
  });

  it("keeps the languages it has when a refresh fails, and says they may be out of date", async () => {
    let isDown = false;
    serveNewLearner({ "GET /languages": () => (isDown ? { status: 500, data: {} } : { status: 200, data: [SPANISH] }) });
    await renderApp();
    expect(await screen.findByRole("button", { name: "Spanish Latin American" })).toBeTruthy();
    expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();

    isDown = true;
    await act(async () => {
      await screen.getByTestId("language-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Spanish Latin American" })).toBeTruthy();
  });

  it("says when the level couldn't be saved, and keeps the choice to try again", async () => {
    const sent = serveNewLearner({ "PUT /profile": () => ({ status: 500, data: {} }) });
    await renderApp();
    await chooseSpanish();

    await fireEvent.press(screen.getByRole("radio", { name: "I can hold a conversation" }));
    await fireEvent.press(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));

    expect(await screen.findByRole("alert", { name: ONBOARDING_COPY.saveFailed })).toBeTruthy();
    expect(screen).toHavePathname("/onboarding/level");
    expect(screen.getByRole("radio", { name: "I can hold a conversation" })).toBeChecked();
    expect(sent.filter((request) => request.route === "PUT /profile")).toHaveLength(1);
  });
});
