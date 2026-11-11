import { DISCOVER_ACTION_MESSAGES as ACTIONS } from "@myjobhunter/api-client/constants/discoverMessages";
import { SAVED_SEARCH_FIELD_HINTS as HINTS, SAVED_SEARCH_PROBLEMS as PROBLEMS } from "@myjobhunter/api-client/constants/savedSearchProblems";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, waitFor, within } from "@testing-library/react-native";
import { screen } from "expo-router/testing-library";
import { DISCOVER_SCREEN_MESSAGES as SCREEN } from "../src/constants/discoverScreen";
import { SAVED_SEARCH_MESSAGES as SAVED } from "../src/constants/savedSearches";
import { CHIP_FIELD_MESSAGES as CHIPS, SAVED_SEARCH_SHEET_MESSAGES as SHEET } from "../src/constants/savedSearchSheet";
import { store } from "../src/lib/store";
import { discoverRoutes } from "../test-support/discoverRoutes";
import { discoverySourceRecord } from "../test-support/discoverySourceRecord";
import { serve } from "../test-support/fakeServer";
import { heldReplies } from "../test-support/heldReplies";
import { storedItems } from "../test-support/memorySecureStore";
import { profileRecord } from "../test-support/profileRecord";
import { renderDiscover } from "../test-support/renderDiscover";
import { storeSession } from "../test-support/storedSession";
import type { FakeRoute } from "../test-support/types/FakeRoute";
import type { SentRequest } from "../test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const WORK_HISTORY: FakeRoute = () => ({
  status: 200,
  data: { items: [{ id: "w1", title: "Staff Engineer" }, { id: "w2", title: "Platform Engineer" }], total: 2 },
});
const CREATED: FakeRoute = (body) => ({ status: 201, data: discoverySourceRecord({ id: "new", ...body }) });
const toastText = async (): Promise<string> => String(within(await screen.findByTestId("toast")).getByRole("alert").props.children);
const bodies = (sent: SentRequest[], route: string) => sent.filter((request) => request.route === route).map(({ body }) => body);
const submit = (label: string) => fireEvent.press(screen.getByRole("button", { name: label }));

function serveForm(overrides: Record<string, FakeRoute> = {}, sources: readonly DiscoverySource[] = []): SentRequest[] {
  return serve({
    ...discoverRoutes(sources, [], { profile: profileRecord({ desired_salary_min: "150000" }), skills: 2 }),
    "GET /work-history": WORK_HISTORY,
    "POST /discover/sources": CREATED,
    "PATCH /profile": (body) => ({ status: 200, data: profileRecord(body) }),
    ...overrides,
  });
}

async function openNew(): Promise<void> {
  await renderDiscover();
  await fireEvent.press((await screen.findAllByRole("button", { name: SCREEN.newSavedSearch }))[0]);
  await screen.findByRole("header", { name: SHEET.newTitle });
}

async function chooseSource(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("radio", { name: label }));
}

// The shared store's queries hold RTK Query's timer for dropping unused data (60s), which would
// keep Jest from exiting; resetting the store clears it.
afterAll(() => store.dispatch(baseApi.util.resetApiState()));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  store.dispatch(baseApi.util.resetApiState());
});

describe("a new JSearch saved search", () => {
  it("shows a skeleton while the profile loads, then starts from the profile", async () => {
    const profile = heldReplies();
    serveForm({ "GET /profile": profile.route });
    await openNew();

    expect(screen.getByLabelText(SHEET.loadingPrefill)).toBeTruthy();
    await profile.answer(0, { status: 200, data: profileRecord({ desired_salary_min: "150000" }) });

    expect(await screen.findByText(SHEET.prefilled)).toBeTruthy();
    expect(screen.getByRole("button", { name: CHIPS.remove("Staff Engineer") })).toBeTruthy();
    expect(screen.getByRole("button", { name: CHIPS.suggest("Platform Engineer") })).toBeTruthy();
    expect(screen.getByLabelText(SHEET.minSalaryLabel).props.value).toBe("150000");
  });

  it("waits for work history to start from its latest title, even when the profile answers first", async () => {
    const workHistory = heldReplies();
    serveForm({ "GET /work-history": workHistory.route });
    await openNew();
    await waitFor(() => expect(screen.getByLabelText(SHEET.loadingPrefill)).toBeTruthy());

    await workHistory.answer(0, { status: 200, data: { items: [{ id: "w1", title: "Staff Engineer" }], total: 1 } });

    expect(await screen.findByRole("button", { name: CHIPS.remove("Staff Engineer") })).toBeTruthy();
  });

  it("adds roles typed, by comma, and from suggestions, removes them, and reads the search back", async () => {
    serveForm();
    await openNew();
    await screen.findByText(SHEET.prefilled);
    const roles = screen.getByLabelText(`${SHEET.rolesLabel}, required`);

    await fireEvent.changeText(roles, "Backend Engineer, SRE");
    expect(screen.getByRole("button", { name: CHIPS.remove("Backend Engineer") })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: CHIPS.addTo(SHEET.rolesLabel) }));
    await fireEvent.press(screen.getByRole("button", { name: CHIPS.suggest("Platform Engineer") }));
    await fireEvent.press(screen.getByRole("button", { name: CHIPS.remove("Staff Engineer") }));
    await fireEvent.press(screen.getByRole("button", { name: CHIPS.suggest("Skill 1") }));

    expect(screen.queryByRole("button", { name: CHIPS.remove("Staff Engineer") })).toBeNull();
    expect(screen.getByText(/Backend Engineer \/ SRE \/ Platform Engineer/)).toBeTruthy();
    expect(screen.getByRole("button", { name: CHIPS.remove("Skill 1") })).toBeTruthy();
    expect(screen.getByText(/matching Skill 1/)).toBeTruthy();
  });

  it("keeps what was typed into a list but never added, when Create is tapped straight after", async () => {
    const sent = serveForm({ "GET /work-history": () => ({ status: 200, data: { items: [], total: 0 } }) });
    await openNew();
    await screen.findByLabelText(`${SHEET.rolesLabel}, required`);
    await fireEvent.changeText(screen.getByLabelText(`${SHEET.rolesLabel}, required`), "Data Engineer");
    await fireEvent.changeText(screen.getByLabelText(SHEET.alsoExcludeLabel), "crypto");

    await submit(SHEET.create);

    expect(await toastText()).toBe(ACTIONS.created);
    expect(bodies(sent, "POST /discover/sources")).toEqual([
      expect.objectContaining({ config: expect.objectContaining({ roles: ["Data Engineer"], excluded_keywords: ["crypto"] }) }),
    ]);
  });

  it("adds what was typed into a list when the field is left", async () => {
    serveForm();
    await openNew();
    await screen.findByText(SHEET.prefilled);
    const skills = screen.getByLabelText(SHEET.skillsLabel);

    await fireEvent.changeText(skills, "Go");
    await fireEvent(skills, "blur");

    expect(screen.getByRole("button", { name: CHIPS.remove("Go") })).toBeTruthy();
    expect(skills.props.value).toBe("");
  });

  it("creates it with the filters chosen and says so", async () => {
    const sent = serveForm();
    await openNew();
    await screen.findByText(SHEET.prefilled);
    await fireEvent.changeText(screen.getByLabelText(SHEET.nameLabel), "  Staff roles  ");
    await fireEvent.changeText(screen.getByLabelText(SHEET.locationLabel), "Austin");

    await submit(SHEET.create);

    expect(await toastText()).toBe(ACTIONS.created);
    expect(bodies(sent, "POST /discover/sources")).toEqual([
      {
        source: "jsearch",
        name: "Staff roles",
        fetch_interval_minutes: 1440,
        config: expect.objectContaining({ roles: ["Staff Engineer"], location: "Austin", min_salary_usd: 150000, remote_jobs_only: false }),
      },
    ]);
    expect(bodies(sent, "PATCH /profile")).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole("header", { name: SHEET.newTitle })).toBeNull());
  });

  it("won't create it without a role", async () => {
    const sent = serveForm({ "GET /work-history": () => ({ status: 200, data: { items: [], total: 0 } }) });
    await openNew();
    await screen.findByLabelText(`${SHEET.rolesLabel}, required`);

    await submit(SHEET.create);

    expect(await screen.findByRole("alert", { name: PROBLEMS.noRoles })).toBeTruthy();
    expect(bodies(sent, "POST /discover/sources")).toHaveLength(0);
  });

  it("keeps the sheet open with the server's reason when it can't create it", async () => {
    serveForm({ "POST /discover/sources": () => ({ status: 409, data: { detail: "A saved search with that name already exists" } }) });
    await openNew();
    await screen.findByText(SHEET.prefilled);

    await submit(SHEET.create);

    expect(await screen.findByText("A saved search with that name already exists")).toBeTruthy();
    expect(screen.getByRole("header", { name: SHEET.newTitle })).toBeTruthy();
  });

  it("saves its filters as the defaults when asked", async () => {
    const sent = serveForm();
    await openNew();
    await screen.findByText(SHEET.prefilled);
    await fireEvent(screen.getByLabelText(SHEET.saveAsDefaults), "valueChange", true);

    await submit(SHEET.create);

    expect(await toastText()).toBe(ACTIONS.created);
    expect(bodies(sent, "PATCH /profile")).toEqual([{ discovery_defaults: expect.objectContaining({ country: "us", excluded_keywords: [] }) }]);
  });

  it("says the search was made but the defaults weren't kept", async () => {
    serveForm({ "PATCH /profile": () => ({ status: 500, data: { detail: "Profile unavailable" } }) });
    await openNew();
    await screen.findByText(SHEET.prefilled);
    await fireEvent(screen.getByLabelText(SHEET.saveAsDefaults), "valueChange", true);

    await submit(SHEET.create);

    expect(await toastText()).toBe(ACTIONS.defaultsFailed);
  });
});

describe("a new board saved search", () => {
  it("checks a Greenhouse token as it's typed and creates it", async () => {
    const sent = serveForm();
    await openNew();
    await chooseSource("Greenhouse");
    const token = screen.getByLabelText(`${SHEET.boardTokenLabel}, required`);

    await fireEvent.changeText(token, "bad token!");
    expect(screen.getByText(HINTS.badBoardToken)).toBeTruthy();
    await fireEvent.changeText(token, "stripe");
    expect(screen.getByText(HINTS.boardToken)).toBeTruthy();
    await submit(SHEET.create);

    expect(await toastText()).toBe(ACTIONS.created);
    expect(bodies(sent, "POST /discover/sources")).toEqual([{ source: "greenhouse", fetch_interval_minutes: 1440, config: { board_token: "stripe" } }]);
  });

  it("asks for a Lever slug, then creates it lowercased with its keywords", async () => {
    const sent = serveForm();
    await openNew();
    await chooseSource("Lever");

    await submit(SHEET.create);
    expect(await screen.findByRole("alert", { name: PROBLEMS.noCompanySlug })).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(`${SHEET.companySlugLabel}, required`), "OpenAI");
    await fireEvent.changeText(screen.getByLabelText(SHEET.boardKeywordsLabel), "intern,");
    await submit(SHEET.create);

    expect(await toastText()).toBe(ACTIONS.created);
    expect(bodies(sent, "POST /discover/sources")).toEqual([
      { source: "lever", fetch_interval_minutes: 1440, config: { company_slug: "openai", excluded_keywords: ["intern"] } },
    ]);
  });
});

describe("editing a saved search", () => {
  const SOURCE = discoverySourceRecord({ id: "src-1", name: "Backend roles", source: "greenhouse", config: { board_token: "stripe" } });

  async function openEdit(): Promise<void> {
    await renderDiscover();
    await fireEvent.press(await screen.findByRole("button", { name: SAVED.actionFor(SAVED.edit, "Backend roles") }));
    await screen.findByRole("header", { name: SHEET.editTitle });
  }

  it("closes without sending anything when nothing changed", async () => {
    const sent = serveForm({}, [SOURCE]);
    await openEdit();
    expect(screen.getByLabelText(SHEET.sourceLabel).props.value).toBe("Greenhouse");

    await submit(SHEET.saveChanges);

    await waitFor(() => expect(screen.queryByRole("header", { name: SHEET.editTitle })).toBeNull());
    expect(bodies(sent, "PATCH /discover/sources/src-1")).toHaveLength(0);
  });

  it("sends only what changed", async () => {
    const sent = serveForm({ "PATCH /discover/sources/src-1": (body) => ({ status: 200, data: { ...SOURCE, ...body } }) }, [SOURCE]);
    await openEdit();
    await fireEvent.changeText(screen.getByLabelText(SHEET.nameLabel), "Stripe roles");
    await fireEvent.press(screen.getByRole("radio", { name: "Every 6 hours" }));

    await submit(SHEET.saveChanges);

    expect(await toastText()).toBe(ACTIONS.updated);
    expect(bodies(sent, "PATCH /discover/sources/src-1")).toEqual([{ name: "Stripe roles", fetch_interval_minutes: 360 }]);
  });

  it("keeps the sheet open when it can't save the changes", async () => {
    serveForm({ "PATCH /discover/sources/src-1": () => ({ status: 500 }) }, [SOURCE]);
    await openEdit();
    await fireEvent.changeText(screen.getByLabelText(`${SHEET.boardTokenLabel}, required`), "acme");

    await act(async () => submit(SHEET.saveChanges));

    expect(await screen.findByText(ACTIONS.updateFailed)).toBeTruthy();
    expect(screen.getByRole("header", { name: SHEET.editTitle })).toBeTruthy();
  });
});
