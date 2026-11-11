import {
  COMPANY_DOMAIN_MAX_LENGTH,
  COMPANY_HQ_LOCATION_MAX_LENGTH,
  COMPANY_INDUSTRY_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
} from "@myjobhunter/api-client/constants/companyFieldLimits";
import { COMPANY_FORM_PROBLEMS as PROBLEMS } from "@myjobhunter/api-client/constants/companyFormProblems";
import type { Company } from "@myjobhunter/api-client/types/company";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { screen } from "expo-router/testing-library";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import { COMPANY_MESSAGES as MESSAGES } from "../src/constants/companies";
import { COMPANY_SORT_KEYS, COMPANY_SORTS, DEFAULT_COMPANY_SORT } from "../src/constants/companySorts";
import CompaniesScreen from "../src/features/companies/CompaniesScreen";
import { store } from "../src/lib/store";
import { companyDetailRoutes } from "../test-support/companyDetailRoutes";
import { companyRecord } from "../test-support/companyRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { storeSession, tokens } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { FakeRoute } from "../test-support/types/FakeRoute";
import type { SentRequest } from "../test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

// The server's order (name A to Z). Each is missing something: Umbrella's domain is blank, which counts as missing.
const ACME = companyRecord({ id: "c1", name: "Acme Corp", primary_domain: "acme.com", industry: "SaaS", hq_location: "Chicago, IL" });
const GLOBEX = companyRecord({ id: "c2", name: "Globex", hq_location: "Austin, TX" });
const INITECH = companyRecord({ id: "c3", name: "Initech", primary_domain: "initech.com", industry: "Fintech" });
const UMBRELLA = companyRecord({ id: "c4", name: "Umbrella", primary_domain: "", industry: "Biotech", hq_location: "Boston, MA" });
const SERVER_ORDER = [ACME, GLOBEX, INITECH, UMBRELLA] as const;

/** What each sort puts first to last, missing values last both ways. */
const SORTED: Record<(typeof COMPANY_SORT_KEYS)[number], string[]> = {
  "name-asc": ["Acme Corp", "Globex", "Initech", "Umbrella"],
  "name-desc": ["Umbrella", "Initech", "Globex", "Acme Corp"],
  "primary_domain-asc": ["Acme Corp", "Initech", "Globex", "Umbrella"],
  "primary_domain-desc": ["Initech", "Acme Corp", "Globex", "Umbrella"],
  "industry-asc": ["Umbrella", "Initech", "Acme Corp", "Globex"],
  "industry-desc": ["Acme Corp", "Initech", "Umbrella", "Globex"],
  "hq_location-asc": ["Globex", "Umbrella", "Acme Corp", "Initech"],
  "hq_location-desc": ["Acme Corp", "Umbrella", "Globex", "Initech"],
};

const refreshed = (): FakeReply => ({ status: 200, data: tokens(1) });
const listOf = (...items: Company[]) => (): FakeReply => ({ status: 200, data: { items, total: items.length } });
const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

/** The companies held in memory, so an add shows in the refetch, plus any overrides. */
function serveCompanies(initial: readonly Company[], overrides: Record<string, FakeRoute> = {}): SentRequest[] {
  let companies = [...initial];
  return serve({
    "GET /companies": () => listOf(...companies)(),
    "POST /companies": (body) => {
      const created = companyRecord({ id: "c-new", ...(body as Pick<Company, "name">) });
      companies = [...companies, created].sort((a, b) => a.name.localeCompare(b.name));
      return { status: 201, data: created };
    },
    ...overrides,
  });
}

const posts = (sent: SentRequest[]) => sent.filter(({ route }) => route === "POST /companies");

async function showScreen(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <CompaniesScreen />
      </ToastProvider>
    </Provider>,
  );
}

function names(): string[] {
  return screen.getAllByRole("link").map((row) => String(row.props.accessibilityLabel).split(",")[0]);
}

async function sortBy(current: string, next: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.sort}: ${current}` }));
  await fireEvent.press(await screen.findByRole("radio", { name: next }));
}

async function pullToRefresh(): Promise<void> {
  await act(async () => {
    await screen.getByTestId("companies-list").props.refreshControl.props.onRefresh();
  });
}

/** The sheet's Add company button: the list header has one too, behind the sheet. */
function saveButton() {
  const buttons = screen.getAllByRole("button", { name: MESSAGES.save });
  return buttons[buttons.length - 1];
}

async function openAddSheet(): Promise<void> {
  await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.add }));
  expect(await screen.findByRole("header", { name: MESSAGES.addTitle })).toBeTruthy();
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  openURL.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

describe("the Companies list", () => {
  it("opens from its route on a skeleton of the rows, then shows every company with what the website's table shows", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    serve({
      "POST /auth/mobile/refresh": refreshed,
      "GET /companies": () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    });
    await renderApp("/companies");

    expect(await screen.findByLabelText(MESSAGES.loadingList)).toBeTruthy();
    expect(screen.getAllByTestId("company-skeleton-row").length).toBeGreaterThan(0);
    // Stand-ins for the Add and Sort buttons, so the rows don't jump down when they arrive.
    expect(screen.getByTestId("companies-header-skeleton")).toBeTruthy();

    await act(async () => answer(listOf(...SERVER_ORDER)()));

    expect(await screen.findByText("Acme Corp")).toBeTruthy();
    expect(screen.queryByLabelText(MESSAGES.loadingList)).toBeNull();
    expect(screen.getByText("acme.com")).toBeTruthy();
    expect(screen.getByText("SaaS · Chicago, IL")).toBeTruthy();
    expect(screen.getByText("Fintech")).toBeTruthy();
    // A blank domain is left out, as a missing one is.
    expect(screen.getByRole("link", { name: "Umbrella, Biotech, Boston, MA" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Globex, Austin, TX" })).toBeTruthy();
    expect(names()).toEqual(SORTED["name-asc"]);
    expect(screen.getByRole("button", { name: `${MESSAGES.sort}: ${COMPANY_SORTS[DEFAULT_COMPANY_SORT].label}` })).toBeTruthy();
  });

  it("opens the company's own screen when its row is pressed, and comes back to the list", async () => {
    serve({
      "POST /auth/mobile/refresh": refreshed,
      "GET /companies": listOf(...SERVER_ORDER),
      ...companyDetailRoutes(INITECH),
    });
    await renderApp("/companies");

    const row = await screen.findByRole("link", { name: "Initech, initech.com, Fintech" });
    expect(row.props.accessibilityHint).toBe(MESSAGES.opensCompany);
    await fireEvent.press(row);

    expect(screen).toHavePathname("/companies/c3");
    expect(await screen.findByRole("header", { name: "Initech" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "initech.com" })).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();

    await act(async () => router.back());
    expect(screen).toHavePathname("/companies");
  });

  it("sorts by any of the website's columns, either way, with companies missing the value last", async () => {
    const sent = serveCompanies(SERVER_ORDER);
    await showScreen();
    await screen.findByText("Acme Corp");

    let current = COMPANY_SORTS[DEFAULT_COMPANY_SORT].label;
    for (const key of COMPANY_SORT_KEYS.filter((each) => each !== DEFAULT_COMPANY_SORT)) {
      const next = COMPANY_SORTS[key].label;
      await sortBy(current, next);
      current = next;
      await waitFor(() => expect(screen.getByRole("button", { name: `${MESSAGES.sort}: ${current}` })).toBeTruthy());
      expect(names()).toEqual(SORTED[key]);
    }
    // Sorting happens on the phone; the list is fetched once.
    expect(sent.filter(({ route }) => route === "GET /companies")).toHaveLength(1);
  });

  it("says when there are no companies yet, and offers to add one", async () => {
    serveCompanies([]);
    await showScreen();

    expect(await screen.findByRole("header", { name: MESSAGES.noneHeading })).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneBody)).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(`^${MESSAGES.sort}:`) })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.addFromEmpty }));
    expect(await screen.findByRole("header", { name: MESSAGES.addTitle })).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("says when the list couldn't load, and loads it on Try again", async () => {
    let reply: FakeReply = { status: 500, data: { detail: "boom" } };
    serve({ "GET /companies": () => reply });
    await showScreen();

    expect(await screen.findByRole("header", { name: MESSAGES.couldntLoadList })).toBeTruthy();
    expect(screen.getByText(MESSAGES.tryAgainOffer)).toBeTruthy();

    reply = listOf(ACME)();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));

    expect(await screen.findByText("Acme Corp")).toBeTruthy();
    expect(screen.queryByRole("header", { name: MESSAGES.couldntLoadList })).toBeNull();
  });

  it("refreshes on pull, and keeps what it last loaded when the refresh fails", async () => {
    let reply: FakeReply = listOf(ACME)();
    serve({ "GET /companies": () => reply });
    await showScreen();
    await screen.findByText("Acme Corp");

    reply = listOf(ACME, GLOBEX)();
    await pullToRefresh();
    expect(await screen.findByText("Globex")).toBeTruthy();

    reply = { status: 503, data: { detail: "down" } };
    await pullToRefresh();
    await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("Globex")).toBeTruthy();
  });

  it("keeps saying there are no companies when a refresh of the empty list fails, rather than that it couldn't load", async () => {
    let reply: FakeReply = listOf()();
    serve({ "GET /companies": () => reply });
    await showScreen();
    await screen.findByRole("header", { name: MESSAGES.noneHeading });

    reply = { status: 503, data: { detail: "down" } };
    await pullToRefresh();

    await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
    expect(screen.getByRole("header", { name: MESSAGES.noneHeading })).toBeTruthy();
    expect(screen.queryByRole("header", { name: MESSAGES.couldntLoadList })).toBeNull();
  });
});

describe("adding a company", () => {
  it("sends the trimmed fields, shows the add in flight at once, says so, and shows it in the list", async () => {
    const HOOLI = companyRecord({ id: "c-new", name: "Hooli", primary_domain: "hooli.xyz", hq_location: "Palo Alto, CA" });
    let companies: Company[] = [ACME];
    let answer: () => void = () => undefined;
    const sent = serve({
      "GET /companies": () => listOf(...companies)(),
      "POST /companies": () =>
        new Promise<FakeReply>(
          (resolve) =>
            (answer = () => {
              companies = [ACME, HOOLI];
              resolve({ status: 201, data: HOOLI });
            }),
        ),
    });
    await showScreen();
    await openAddSheet();

    await fireEvent.changeText(screen.getByLabelText(`${MESSAGES.nameLabel}, required`), "  Hooli ");
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.domainLabel), " hooli.xyz ");
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.industryLabel), "   ");
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.hqLabel), "Palo Alto, CA");
    await fireEvent.press(saveButton());

    // The button says it's working the moment it's pressed, and Cancel waits.
    expect(await screen.findByText(MESSAGES.saving)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.saving }).props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
    expect(screen.getByRole("button", { name: MESSAGES.cancel }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(posts(sent).map(({ body }) => body)).toEqual([
      { name: "Hooli", primary_domain: "hooli.xyz", industry: null, hq_location: "Palo Alto, CA" },
    ]);

    await act(async () => answer());

    expect(await screen.findByText(MESSAGES.added("Hooli"))).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("header", { name: MESSAGES.addTitle })).toBeNull());
    expect(await screen.findByRole("link", { name: "Hooli, hooli.xyz, Palo Alto, CA" })).toBeTruthy();
    expect(names()).toEqual(["Acme Corp", "Hooli"]);
  });

  it("asks for a name before sending, and doesn't count spaces as one", async () => {
    const sent = serveCompanies([ACME]);
    await showScreen();
    await openAddSheet();

    await fireEvent.press(saveButton());
    expect(await screen.findByText(PROBLEMS.nameRequired)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(`${MESSAGES.nameLabel}, required`), "   ");
    await fireEvent.press(saveButton());
    expect(screen.getByText(PROBLEMS.nameRequired)).toBeTruthy();
    expect(posts(sent)).toEqual([]);
  });

  it("says which fields are longer than the server takes, keeping all of what was typed, and sends nothing", async () => {
    const sent = serveCompanies([ACME]);
    await showScreen();
    await openAddSheet();

    const longName = "n".repeat(COMPANY_NAME_MAX_LENGTH + 1);
    await fireEvent.changeText(screen.getByLabelText(`${MESSAGES.nameLabel}, required`), longName);
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.domainLabel), "d".repeat(COMPANY_DOMAIN_MAX_LENGTH + 1));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.industryLabel), "i".repeat(COMPANY_INDUSTRY_MAX_LENGTH + 1));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.hqLabel), "h".repeat(COMPANY_HQ_LOCATION_MAX_LENGTH + 1));
    await fireEvent.press(saveButton());

    expect(await screen.findByText(PROBLEMS.nameTooLong)).toBeTruthy();
    expect(screen.getByText(PROBLEMS.domainTooLong)).toBeTruthy();
    expect(screen.getByText(PROBLEMS.industryTooLong)).toBeTruthy();
    expect(screen.getByText(PROBLEMS.hqLocationTooLong)).toBeTruthy();
    // No maxLength: nothing was cut off.
    expect(screen.getByLabelText(`${MESSAGES.nameLabel}, required`).props.value).toBe(longName);
    expect(screen.getByLabelText(`${MESSAGES.nameLabel}, required`).props.maxLength).toBeUndefined();
    expect(posts(sent)).toEqual([]);

    // Right at the limits it goes through.
    await fireEvent.changeText(screen.getByLabelText(`${MESSAGES.nameLabel}, required`), "n".repeat(COMPANY_NAME_MAX_LENGTH));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.domainLabel), "d".repeat(COMPANY_DOMAIN_MAX_LENGTH));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.industryLabel), "i".repeat(COMPANY_INDUSTRY_MAX_LENGTH));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.hqLabel), "h".repeat(COMPANY_HQ_LOCATION_MAX_LENGTH));
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.added("n".repeat(COMPANY_NAME_MAX_LENGTH)))).toBeTruthy();
    expect(posts(sent)).toHaveLength(1);
  });

  it("keeps the sheet and what was typed, with the reason at the top, when the add fails", async () => {
    let reply: FakeReply = { status: 500, data: { detail: "boom" } };
    const sent = serveCompanies([ACME], { "POST /companies": () => reply });
    await showScreen();
    await openAddSheet();

    await fireEvent.changeText(screen.getByLabelText(`${MESSAGES.nameLabel}, required`), "Hooli");
    await fireEvent.press(saveButton());

    expect(await screen.findByText(MESSAGES.couldntAdd)).toBeTruthy();
    expect(screen.getByRole("header", { name: MESSAGES.addTitle })).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.nameLabel}, required`).props.value).toBe("Hooli");
    expect(screen.queryByText(MESSAGES.added("Hooli"))).toBeNull();

    reply = { status: 201, data: companyRecord({ id: "c-new", name: "Hooli" }) };
    await fireEvent.press(saveButton());
    expect(await screen.findByText(MESSAGES.added("Hooli"))).toBeTruthy();
    expect(posts(sent)).toHaveLength(2);
  });

  it("says on the domain field when another company already has it, until the domain changes", async () => {
    serveCompanies([ACME], { "POST /companies": () => ({ status: 409, data: { detail: "A company with primary_domain='acme.com' already exists." } }) });
    await showScreen();
    await openAddSheet();

    await fireEvent.changeText(screen.getByLabelText(`${MESSAGES.nameLabel}, required`), "Acme Again");
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.domainLabel), "acme.com");
    await fireEvent.press(saveButton());

    expect(await screen.findByText(PROBLEMS.duplicateDomain)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.domainHint)).toBeNull();
    expect(screen.queryByText(MESSAGES.couldntAdd)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText(MESSAGES.domainLabel), "acme.io");
    expect(screen.queryByText(PROBLEMS.duplicateDomain)).toBeNull();
    expect(screen.getByText(MESSAGES.domainHint)).toBeTruthy();
  });

  it("closes on Cancel without sending, and opens empty the next time", async () => {
    const sent = serveCompanies([ACME]);
    await showScreen();
    await openAddSheet();

    await fireEvent.changeText(screen.getByLabelText(`${MESSAGES.nameLabel}, required`), "Hooli");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.cancel }));
    await waitFor(() => expect(screen.queryByRole("header", { name: MESSAGES.addTitle })).toBeNull());
    expect(posts(sent)).toEqual([]);

    await openAddSheet();
    expect(screen.getByLabelText(`${MESSAGES.nameLabel}, required`).props.value).toBe("");
  });
});
