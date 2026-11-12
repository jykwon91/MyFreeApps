import { baseApi } from "@platform/core/store/baseApi";
import { OPTION_SHEET_ROW_HEIGHT, SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { PROFILE_MESSAGES as MESSAGES } from "../src/constants/profile";
import { EDUCATION_MESSAGES } from "../src/constants/profileEducation";
import { SCREENING_MESSAGES } from "../src/constants/profileScreening";
import { SKILL_MESSAGES } from "../src/constants/profileSkills";
import { WORK_HISTORY_MESSAGES } from "../src/constants/profileWorkHistory";
import { store } from "../src/lib/store";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { heldReplies } from "../test-support/heldReplies";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { profileRecord } from "../test-support/profileRecord";
import { profileRoutes } from "../test-support/profileRoutes";
import { renderApp } from "../test-support/renderApp";
import { renderProfile } from "../test-support/renderProfile";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const FILLED = profileRecord({
  seniority: "senior",
  summary: "Backend engineer who likes payments.",
  work_auth_status: "h1b",
  desired_salary_min: "150000",
  desired_salary_max: "190000",
  locations: ["San Francisco, CA", "Remote"],
  remote_preference: "hybrid",
});

const patches = (sent: SentRequest[]) => sent.filter(({ route }) => route === "PATCH /profile").map(({ body }) => body);

// The shared store's queries hold RTK Query's timer for dropping unused data (60s), which would
// keep Jest from exiting; resetting the store clears it.
afterAll(() => store.dispatch(baseApi.util.resetApiState()));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("opening the Profile tab", () => {
  it("is the tab the app shows for the website's /profile", async () => {
    serve({ "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }), ...profileRoutes({ profile: FILLED }) });
    await renderApp("/profile");

    expect(await screen.findByTestId("profile")).toBeTruthy();
    expect(screen.getByText("Senior level")).toBeTruthy();
  });

  it("shows a skeleton of every section while the profile loads, then the profile", async () => {
    const held = heldReplies();
    serve({ ...profileRoutes({ profile: FILLED }), "GET /profile": held.route });
    await renderProfile();

    const skeleton = await screen.findByTestId("profile-skeleton");
    expect(skeleton.props.accessibilityLabel).toBe(MESSAGES.loading);
    for (const section of ["about", "preferences", "work-history", "education", "skills", "screening"]) {
      expect(screen.getByTestId(`skeleton-profile-${section}`)).toBeTruthy();
    }
    // The preferences' facts and remote choices have stand-ins, so nothing jumps when they arrive.
    expect(screen.getAllByTestId("skeleton-profile-fact")).toHaveLength(2);
    const remoteRows = screen.getAllByTestId("skeleton-profile-remote-row", { includeHiddenElements: true });
    expect(remoteRows).toHaveLength(4);
    // Each stand-in is as tall as the choice row that replaces it.
    for (const row of remoteRows) expect(StyleSheet.flatten(row.props.style)).toEqual(expect.objectContaining({ height: OPTION_SHEET_ROW_HEIGHT }));

    await held.answer(0, { status: 200, data: FILLED });
    expect(await screen.findByTestId("profile")).toBeTruthy();
    expect(screen.queryByTestId("profile-skeleton")).toBeNull();
  });

  it("shows what the website shows: level, summary, salary, work authorization, locations and remote preference", async () => {
    serve(profileRoutes({ profile: FILLED }));
    await renderProfile();

    const about = await screen.findByTestId("profile-about");
    expect(within(about).getByText("Senior level")).toBeTruthy();
    expect(within(about).getByText("Backend engineer who likes payments.")).toBeTruthy();
    const preferences = screen.getByTestId("profile-preferences");
    expect(within(preferences).getByLabelText(`${MESSAGES.salaryLabel}: $150,000 – $190,000 / year`)).toBeTruthy();
    expect(within(preferences).getByLabelText(`${MESSAGES.workAuthLabel}: H-1B`)).toBeTruthy();
    expect(within(preferences).getByText("San Francisco, CA")).toBeTruthy();
    expect(within(preferences).getByText("Remote")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Hybrid" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
  });

  it("says what isn't set yet, and shows every list's empty state with its Add button", async () => {
    serve(profileRoutes());
    await renderProfile();

    expect(await screen.findByText(MESSAGES.levelNotSet)).toBeTruthy();
    expect(screen.getByText(MESSAGES.noSummary)).toBeTruthy();
    expect(screen.getByText(MESSAGES.noLocations)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.salaryLabel}: —`)).toBeTruthy();
    for (const list of [WORK_HISTORY_MESSAGES, EDUCATION_MESSAGES, SKILL_MESSAGES, SCREENING_MESSAGES]) {
      expect(await screen.findByText(list.none)).toBeTruthy();
      expect(screen.getByText(list.noneBody)).toBeTruthy();
      expect(screen.getByRole("button", { name: list.add })).toBeTruthy();
    }
  });

  it("offers to try again when the profile can't load, and shows it once it does", async () => {
    let fails = true;
    const routes = profileRoutes({ profile: FILLED });
    serve({ ...routes, "GET /profile": (body, params) => (fails ? { status: 500 } : routes["GET /profile"]?.(body, params) ?? { status: 500 }) });
    await renderProfile();

    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.getByText(MESSAGES.tryAgainOffer)).toBeTruthy();
    fails = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));

    expect(await screen.findByText("Senior level")).toBeTruthy();
  });

  it("shows a list that couldn't load as its own error with a retry, and keeps the rest of the profile", async () => {
    let fails = true;
    const routes = profileRoutes({ profile: FILLED });
    serve({
      ...routes,
      "GET /education": (body, params) => (fails ? { status: 500 } : routes["GET /education"]?.(body, params) ?? { status: 500 }),
    });
    await renderProfile();

    const education = await screen.findByTestId("profile-education");
    expect(await within(education).findByText(EDUCATION_MESSAGES.couldntLoad)).toBeTruthy();
    expect(within(education).queryByRole("button", { name: EDUCATION_MESSAGES.add })).toBeNull();
    expect(screen.getByText(WORK_HISTORY_MESSAGES.none)).toBeTruthy();

    fails = false;
    await fireEvent.press(within(education).getByRole("button", { name: EDUCATION_MESSAGES.tryAgain }));
    expect(await within(education).findByText(EDUCATION_MESSAGES.none)).toBeTruthy();
  });

  it("keeps the profile on screen under a banner when a refresh fails", async () => {
    let fails = false;
    const routes = profileRoutes({ profile: FILLED });
    serve({ ...routes, "GET /profile": (body, params) => (fails ? { status: 500 } : routes["GET /profile"]?.(body, params) ?? { status: 500 }) });
    await renderProfile();
    const scroller = await screen.findByTestId("profile");

    fails = true;
    await act(async () => scroller.props.refreshControl.props.onRefresh());

    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Senior level")).toBeTruthy();
  });
});

describe("editing About you", () => {
  async function openSheet(): Promise<void> {
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.editAbout }));
  }

  it("starts from what's saved, sends the level and trimmed summary, says so, and shows them", async () => {
    const sent = serve(profileRoutes({ profile: FILLED }));
    await renderProfile();
    await openSheet();

    expect(screen.getByRole("radio", { name: "Senior" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByLabelText(MESSAGES.summaryLabel).props.value).toBe(FILLED.summary);
    await fireEvent.press(screen.getByRole("radio", { name: "Staff" }));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.summaryLabel), "  Staff engineer, payments.  ");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveChanges }));

    expect(await screen.findByText(MESSAGES.aboutSaved)).toBeTruthy();
    expect(patches(sent)).toEqual([{ seniority: "staff", summary: "Staff engineer, payments." }]);
    expect(await screen.findByText("Staff level")).toBeTruthy();
    expect(screen.getByText("Staff engineer, payments.")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.aboutSheetTitle)).toBeNull();
  });

  it("clears the level and summary when they're emptied", async () => {
    const sent = serve(profileRoutes({ profile: FILLED }));
    await renderProfile();
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: MESSAGES.seniorityNotSet }));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.summaryLabel), "   ");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveChanges }));

    expect(await screen.findByText(MESSAGES.aboutSaved)).toBeTruthy();
    expect(patches(sent)).toEqual([{ seniority: null, summary: null }]);
    expect(await screen.findByText(MESSAGES.levelNotSet)).toBeTruthy();
  });

  it("shows the save in flight at once, holding Cancel until it lands", async () => {
    const held = heldReplies();
    serve({ ...profileRoutes({ profile: FILLED }), "PATCH /profile": held.route });
    await renderProfile();
    await openSheet();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveChanges }));

    expect(await screen.findByText(MESSAGES.saving)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.cancel }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await held.answer(0, { status: 200, data: FILLED });
    expect(await screen.findByText(MESSAGES.aboutSaved)).toBeTruthy();
  });

  it("keeps the sheet and what was typed, with the reason at the top, when the save fails", async () => {
    serve({ ...profileRoutes({ profile: FILLED }), "PATCH /profile": () => ({ status: 500 }) });
    await renderProfile();
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.summaryLabel), "New summary");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveChanges }));

    expect(await screen.findByText(MESSAGES.couldntSaveAbout)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.summaryLabel).props.value).toBe("New summary");
    expect(screen.queryByText(MESSAGES.aboutSaved)).toBeNull();
  });

  it("closes without saving on Cancel", async () => {
    const sent = serve(profileRoutes({ profile: FILLED }));
    await renderProfile();
    await openSheet();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.summaryLabel), "Not this");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.cancel }));

    expect(screen.queryByLabelText(MESSAGES.summaryLabel)).toBeNull();
    expect(patches(sent)).toEqual([]);
    expect(screen.getByText("Backend engineer who likes payments.")).toBeTruthy();
  });
});

describe("the remote preference", () => {
  const isChecked = (name: string) => screen.getByRole("radio", { name }).props.accessibilityState.checked;

  /** The fake profile's PATCH, held until the test answers it; then it saves as the server would. */
  function heldSave(routes: ReturnType<typeof profileRoutes>) {
    const held = heldReplies();
    const save = routes["PATCH /profile"];
    return {
      answer: () => held.answer(0, { status: 200 }),
      route: async (body: Record<string, unknown>, params: Parameters<NonNullable<typeof save>>[1]) => {
        await held.route(body, params);
        return save?.(body, params) ?? { status: 500 };
      },
    };
  }

  it("saves a tapped choice at once, showing it chosen and saving, says so, and keeps showing it", async () => {
    const routes = profileRoutes({ profile: FILLED });
    const held = heldSave(routes);
    const sent = serve({ ...routes, "PATCH /profile": held.route });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("radio", { name: "Remote only" }));

    expect(isChecked("Remote only")).toBe(true);
    expect(screen.getByText(MESSAGES.remoteSaving)).toBeTruthy();
    expect(patches(sent)).toEqual([{ remote_preference: "remote_only" }]);
    // While it saves, another tap does nothing.
    await fireEvent.press(screen.getByRole("radio", { name: "On-site" }));
    expect(patches(sent)).toHaveLength(1);

    await held.answer();
    expect(await screen.findByText(MESSAGES.remoteSaved)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(MESSAGES.remoteSaving)).toBeNull());
    expect(isChecked("Remote only")).toBe(true);
    expect(isChecked("Hybrid")).toBe(false);
    // The refetch the save starts brings back the same choice.
    await waitFor(() => expect(sent.filter(({ route }) => route === "GET /profile").length).toBeGreaterThan(1));
    expect(isChecked("Remote only")).toBe(true);
  });

  it("keeps showing the saved choice when the refetch after the save fails", async () => {
    let refetchFails = false;
    const routes = profileRoutes({ profile: FILLED });
    const sent = serve({
      ...routes,
      "GET /profile": (body, params) => (refetchFails ? { status: 500 } : routes["GET /profile"]?.(body, params) ?? { status: 500 }),
      "PATCH /profile": (body, params) => {
        refetchFails = true;
        return routes["PATCH /profile"]?.(body, params) ?? { status: 500 };
      },
    });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("radio", { name: "Remote only" }));

    expect(await screen.findByText(MESSAGES.remoteSaved)).toBeTruthy();
    await waitFor(() => expect(sent.filter(({ route }) => route === "GET /profile").length).toBeGreaterThan(1));
    expect(isChecked("Remote only")).toBe(true);
    expect(isChecked("Hybrid")).toBe(false);
  });

  it("sends one save for a quick double tap", async () => {
    const sent = serve(profileRoutes({ profile: FILLED }));
    await renderProfile();
    const remote = await screen.findByRole("radio", { name: "Remote only" });
    const onsite = screen.getByRole("radio", { name: "On-site" });
    // Both taps land before the screen re-renders, so only the guard can stop the second.
    await act(async () => {
      fireEvent.press(remote);
      fireEvent.press(onsite);
    });

    expect(await screen.findByText(MESSAGES.remoteSaved)).toBeTruthy();
    expect(patches(sent)).toEqual([{ remote_preference: "remote_only" }]);
    expect(isChecked("Remote only")).toBe(true);
  });

  it("doesn't send the choice that's already saved", async () => {
    const sent = serve(profileRoutes({ profile: FILLED }));
    await renderProfile();
    await fireEvent.press(await screen.findByRole("radio", { name: "Hybrid" }));

    expect(patches(sent)).toEqual([]);
  });

  it("goes back to the saved choice and says so when the save fails", async () => {
    serve({ ...profileRoutes({ profile: FILLED }), "PATCH /profile": () => ({ status: 500 }) });
    await renderProfile();
    await fireEvent.press(await screen.findByRole("radio", { name: "On-site" }));

    expect(await screen.findByText(MESSAGES.couldntSaveRemote)).toBeTruthy();
    expect(isChecked("Hybrid")).toBe(true);
    expect(isChecked("On-site")).toBe(false);
  });
});
