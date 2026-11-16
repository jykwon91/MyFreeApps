import api from "@platform/core/lib/api";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../src/constants/moneyAnalysis";
import { drillDownFilterFromParams } from "../src/features/drillDown/drillDownLink";
import type { DrillDownParams } from "../src/types/DrillDownParams";
import { holdSummary, renderHome, resetHome } from "../test-support/homeScreen";
import { aProperty, startTransactionServer, type FakeTransactionServer } from "../test-support/transactionsServer";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  router: { navigate: (path: string) => mockNavigate(path), push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;
const TWO_PROPERTIES = [aProperty({ id: "p1", name: "Elm St" }), aProperty({ id: "p2", name: "Oak Ave" })];
const SPENDING = { rental_revenue: 9000, maintenance: 1200, utilities: 300 };

beforeEach(() => {
  resetHome();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function summaryUrls(server: FakeTransactionServer): string[] {
  return server.requests.map((request) => request.url ?? "").filter((url) => url.startsWith("/summary?"));
}

/** The drill-down a navigation opened, read back the way the drill-down screen reads it. */
function openedDrillDown() {
  const path: string = mockNavigate.mock.calls.at(-1)?.[0] ?? "";
  expect(path.startsWith("/analytics/drill-down?")).toBe(true);
  const params = Object.fromEntries(new URLSearchParams(path.split("?")[1])) as Partial<DrillDownParams>;
  return drillDownFilterFromParams(params);
}

async function chooseProperty(name: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${MESSAGES.properties},`) }));
  await fireEvent.press(await screen.findByText(name));
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.done }));
}

async function onlyCategory(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${MESSAGES.categories},`) }));
  await fireEvent.press(await screen.findByRole("button", { name: `${MESSAGES.only} ${label}` }));
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.done }));
}

describe("Home filters", () => {
  it("asks for one property's numbers and shows them, then all of them again", async () => {
    const server = startTransactionServer([], TWO_PROPERTIES);
    server.summary = { revenue: 500, expenses: 0, profit: 500 };
    await renderHome();
    await screen.findByText("+$500.00");
    server.summary = { revenue: 200, expenses: 0, profit: 200 };
    await chooseProperty("Oak Ave");
    expect(await screen.findByText("+$200.00")).toBeTruthy();
    expect(screen.queryByText("+$500.00")).toBeNull();
    expect(summaryUrls(server).at(-1)).toMatch(/&property_ids=p2$/);
    expect(screen.getByRole("button", { name: `${MESSAGES.properties}, Oak Ave` })).toBeTruthy();

    // Back to the answer for every property, already asked for when Home opened.
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.properties}, Oak Ave` }));
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.allProperties }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.done }));
    expect(await screen.findByText("+$500.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: `${MESSAGES.properties}, ${MESSAGES.allProperties}` })).toBeTruthy();
  });

  it("shows a skeleton, not the other properties' totals, while a property's numbers load", async () => {
    const server = startTransactionServer([], TWO_PROPERTIES);
    server.summary = { revenue: 500, expenses: 0, profit: 500 };
    await renderHome();
    await screen.findByText("+$500.00");
    holdSummary();
    await chooseProperty("Oak Ave");
    expect(await screen.findByTestId("home-numbers-skeleton")).toBeTruthy();
    expect(screen.queryByText("+$500.00")).toBeNull();
  });

  it("offers no property filter with only one property", async () => {
    const server = startTransactionServer([], [aProperty()]);
    server.summary = { revenue: 1, expenses: 0, profit: 1 };
    await renderHome();
    await screen.findByText("+$1.00");
    expect(screen.queryByRole("button", { name: new RegExp(`^${MESSAGES.properties},`) })).toBeNull();
    expect(screen.getByRole("button", { name: `${MESSAGES.categories}, ${MESSAGES.allCategories}` })).toBeTruthy();
  });

  it("narrows the totals and where it went to the categories left on, without asking again", async () => {
    const server = startTransactionServer([], TWO_PROPERTIES);
    server.summary = { revenue: 9000, expenses: 1500, profit: 7500, by_category: SPENDING };
    await renderHome();
    await screen.findByText("+$7,500.00");
    const asked = summaryUrls(server).length;
    await onlyCategory("Utilities");
    expect(await screen.findByText("−$300.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Utilities, 300 dollars" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Maintenance, 1,200 dollars" })).toBeNull();
    expect(summaryUrls(server)).toHaveLength(asked);
  });

  it("says when the filters leave nothing, and shows everything again on request", async () => {
    const server = startTransactionServer([], TWO_PROPERTIES);
    server.summary = { revenue: 500, expenses: 0, profit: 500 };
    await renderHome();
    await screen.findByText("+$500.00");
    server.summary = { revenue: 0, expenses: 0, profit: 0 };
    await chooseProperty("Oak Ave");
    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByText("Approved transactions only.")).toBeNull();

    server.summary = { revenue: 500, expenses: 0, profit: 500 };
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.clear }));
    expect(await screen.findByText("+$500.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: `${MESSAGES.properties}, ${MESSAGES.allProperties}` })).toBeTruthy();
  });

  it("opens a category's expenses within the chosen property", async () => {
    const server = startTransactionServer([], TWO_PROPERTIES);
    server.summary = { revenue: 9000, expenses: 1500, profit: 7500, by_category: SPENDING };
    await renderHome();
    await screen.findByText("Where it went");
    await chooseProperty("Oak Ave");
    await fireEvent.press(await screen.findByRole("button", { name: "Utilities, 300 dollars" }));
    const filter = openedDrillDown();
    expect(filter).toMatchObject({ category: "utilities", propertyIds: ["p2"] });
    expect(filter.startDate).toBeDefined();
    expect(filter.categories).toBeUndefined();
  });

  it("opens all expenses within the chosen categories", async () => {
    const server = startTransactionServer([], TWO_PROPERTIES);
    server.summary = { revenue: 9000, expenses: 1500, profit: 7500, by_category: SPENDING };
    await renderHome();
    await screen.findByText("Where it went");
    await onlyCategory("Maintenance");
    await fireEvent.press(await screen.findByRole("button", { name: "See all expenses" }));
    expect(openedDrillDown()).toMatchObject({ type: "expenses", categories: ["maintenance"], propertyIds: undefined });
  });

  it("opens a month within the chosen property", async () => {
    const year = new Date().getFullYear();
    const server = startTransactionServer([], TWO_PROPERTIES);
    server.summary = { revenue: 30, expenses: 0, profit: 30, by_month: [`${year}-01`, `${year}-02`].map((month) => ({ month, revenue: 15, expenses: 0, profit: 15 })) };
    await renderHome();
    await fireEvent.press(await screen.findByRole("tab", { name: "This year" }));
    await screen.findByText("+$30.00");
    await chooseProperty("Oak Ave");
    await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`February ${year}$`) }));
    expect(openedDrillDown()).toMatchObject({ propertyIds: ["p2"], startDate: `${year}-02-01`, endDate: `${year}-02-28` });
  });

  it("keeps opening the transactions list when every property is chosen", async () => {
    const server = startTransactionServer([], TWO_PROPERTIES);
    server.summary = { revenue: 9000, expenses: 1500, profit: 7500, by_category: SPENDING };
    await renderHome();
    await screen.findByText("Where it went");
    await chooseProperty("Oak Ave");
    await chooseProperty("Elm St");
    await waitFor(() => expect(summaryUrls(server).at(-1)).toMatch(/property_ids=p2&property_ids=p1$/));
    await fireEvent.press(await screen.findByRole("button", { name: "Utilities, 300 dollars" }));
    expect(mockNavigate.mock.calls.at(-1)?.[0]).toMatch(/^\/money\?segment=transactions.*&category=utilities&/);
  });
});
