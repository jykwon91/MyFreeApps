import { documentsApi } from "@mybookkeeper/api-client/store/documentsApi";
import api from "@platform/core/lib/api";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { ALL_DOCUMENTS } from "../src/constants/documents";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { store } from "../src/lib/store";
import { failRequests, holdRequests, holdSummary, pull, renderHome as renderScreen, resetHome } from "../test-support/homeScreen";
import { aTransaction, startTransactionServer } from "../test-support/transactionsServer";

const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { navigate: (path: string) => mockNavigate(path), push: (path: string) => mockPush(path) },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetHome();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

const aPropertyTotal = (index: number, profit = 100) => ({
  property_id: `p${index}`,
  name: `Property ${index}`,
  revenue: profit,
  expenses: 0,
  profit,
});

describe("HomeScreen", () => {
  it("shows the net with income and expenses, and says it's approved only", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 4000, expenses: 789.6, profit: 3210.4, by_property: [] };
    await renderScreen();
    expect(await screen.findByText("+$3,210.40")).toBeTruthy();
    expect(screen.getByText("$4,000.00")).toBeTruthy();
    expect(screen.getByText("$789.60")).toBeTruthy();
    expect(screen.getByText("Approved transactions only.")).toBeTruthy();
    expect(screen.getByLabelText(/This month: net 3,210 dollars and 40 cents/)).toBeTruthy();
  });

  it("says plainly when more went out than came in", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 100, expenses: 300, profit: -200, by_property: [] };
    await renderScreen();
    expect(await screen.findByText("\u2212$200.00")).toBeTruthy();
    expect(screen.getByText("You spent more than you earned.")).toBeTruthy();
    expect(screen.getByLabelText(/net minus 200 dollars/)).toBeTruthy();
  });

  it("leads on to the full analysis, where any dates can be picked and compared", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 10, expenses: 0, profit: 10, by_property: [] };
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Explore all your numbers" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/analytics/money");
  });

  it("asks for the year's numbers when switched, without showing the month's meanwhile", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 10, expenses: 0, profit: 10, by_property: [] };
    await renderScreen();
    await screen.findByText("+$10.00");
    server.summary = { revenue: 99, expenses: 0, profit: 99, by_property: [] };
    await fireEvent.press(screen.getByRole("tab", { name: "This year" }));
    expect(screen.queryByText("+$10.00")).toBeNull();
    expect(await screen.findByText("+$99.00")).toBeTruthy();
    const year = new Date().getFullYear();
    expect(server.requests.some((request) => request.url === `/summary?start_date=${year}-01-01&end_date=${year}-12-31`)).toBe(true);
  });

  it("links what's waiting straight to the filtered lists", async () => {
    const server = startTransactionServer([aTransaction({ status: "pending" }), aTransaction({ id: "t2", status: "unverified" })]);
    server.documents = [{ id: "d1", status: "failed" }, { id: "d2", status: "completed" }];
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "2 transactions to review" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/money?segment=transactions&view=review&period=all&month=&from=&to=&type=&property=&category=&vendor=&status=&tax=&sort=&order=");
    await fireEvent.press(screen.getByRole("button", { name: "1 document needs a look" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/money?segment=documents&filter=needsALook");
  });

  it("links rent receipts waiting to send, asking only for the count", async () => {
    const server = startTransactionServer([]);
    server.pendingReceipts = 2;
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "2 rent receipts waiting to send" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/receipts");
    expect(server.requests.find((request) => request.url === "/rent-receipts/pending")?.params).toEqual({ limit: 1 });
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("links payments waiting to be matched to a tenant, asking only for the count", async () => {
    const server = startTransactionServer([]);
    server.pendingPayments = 3;
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "3 payments to match to a tenant" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/payment-review");
    expect(server.requests.find((request) => request.url === "/transactions/attribution-review-queue")?.params).toEqual({ limit: 1 });
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("doesn't ask a viewer about payments to match, and calls them caught up", async () => {
    const server = startTransactionServer([]);
    server.role = "viewer";
    server.pendingPayments = 3;
    await renderScreen();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(server.requests.some((request) => request.url === "/transactions/attribution-review-queue")).toBe(false);
  });

  it("says when the payments can't be checked, and isn't caught up", async () => {
    startTransactionServer([]);
    failRequests("/transactions/attribution-review-queue");
    await renderScreen();
    expect(await screen.findByText("I couldn't check your payments to match.")).toBeTruthy();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("doesn't ask a viewer about receipts they can't send", async () => {
    const server = startTransactionServer([]);
    server.role = "viewer";
    server.pendingReceipts = 2;
    await renderScreen();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(server.requests.some((request) => request.url === "/rent-receipts/pending")).toBe(false);
  });

  it("says when the receipts can't be checked, and isn't caught up", async () => {
    startTransactionServer([]);
    failRequests("/rent-receipts/pending");
    await renderScreen();
    expect(await screen.findByText("I couldn't check your rent receipts.")).toBeTruthy();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("keeps loading, never blank or caught up, while only the receipts are still coming", async () => {
    startTransactionServer([]);
    holdRequests("/rent-receipts/pending");
    await renderScreen();
    expect(await screen.findByLabelText("Loading what's waiting for you")).toBeTruthy();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("says what failed when more than one can't be checked", async () => {
    startTransactionServer([]);
    failRequests("/rent-receipts/pending", "/documents");
    await renderScreen();
    expect(await screen.findByText("I couldn't check what's waiting for you.")).toBeTruthy();
  });

  it("says when nothing is waiting", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
  });

  it("opens the same approved rows the total counts, for the same period, including the unassigned ones", async () => {
    const server = startTransactionServer([]);
    server.summary = {
      revenue: 0,
      expenses: 0,
      profit: 0,
      by_property: [aPropertyTotal(1), { ...aPropertyTotal(2), property_id: "unassigned", name: "Unassigned" }],
    };
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText(/^Unassigned, net/));
    expect(mockNavigate).toHaveBeenCalledWith("/money?segment=transactions&view=all&period=thisMonth&month=&from=&to=&type=&property=unassigned&category=&vendor=&status=approved&tax=&sort=&order=");
  });

  it("hides the breakdown for a single property", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 1, expenses: 0, profit: 1, by_property: [aPropertyTotal(1)] };
    await renderScreen();
    await screen.findByText("+$1.00");
    expect(screen.queryByText("By property")).toBeNull();
  });

  it("shows five properties and then the rest on request", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 1, expenses: 0, profit: 1, by_property: [1, 2, 3, 4, 5, 6, 7].map((index) => aPropertyTotal(index)) };
    await renderScreen();
    await screen.findByText("Property 5");
    expect(screen.queryByText("Property 6")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getByText("Property 7")).toBeTruthy();
  });

  it("keeps what's waiting when the numbers fail, and retries just those", async () => {
    const server = startTransactionServer([aTransaction({ status: "pending" })]);
    server.failSummary = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load this month's numbers.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 transaction to review" })).toBeTruthy();
    server.failSummary = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Approved transactions only.")).toBeTruthy();
  });

  it("keeps the numbers when what's waiting can't be checked", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 5, expenses: 0, profit: 5, by_property: [] };
    failRequests("/transactions/review-count");
    await renderScreen();
    expect(await screen.findByText("I couldn't check your transactions.")).toBeTruthy();
    expect(screen.getByText("+$5.00")).toBeTruthy();
  });

  it("invites a first photo when there's nothing at all", async () => {
    const server = startTransactionServer([]);
    server.summaryYears = [];
    await renderScreen();
    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Take a photo" }));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("doesn't call it empty when only older years have numbers", async () => {
    const server = startTransactionServer([]);
    server.summaryYears = [2024];
    await renderScreen();
    expect(await screen.findByText("Approved transactions only.")).toBeTruthy();
    expect(screen.queryByText("Nothing here yet")).toBeNull();
  });

  it("shows a skeleton where the numbers go while they load", async () => {
    startTransactionServer([]);
    holdSummary();
    await renderScreen();
    expect(await screen.findByTestId("home-numbers-skeleton")).toBeTruthy();
    expect(screen.queryByText("Approved transactions only.")).toBeNull();
  });

  it("still shows the waiting transactions when documents can't be checked", async () => {
    startTransactionServer([aTransaction({ status: "pending" })]);
    failRequests("/documents");
    await renderScreen();
    expect(await screen.findByText("I couldn't check your documents.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 transaction to review" })).toBeTruthy();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("says what failed when neither can be checked", async () => {
    startTransactionServer([]);
    failRequests("/documents", "/transactions/review-count");
    await renderScreen();
    expect(await screen.findByText("I couldn't check what's waiting for you.")).toBeTruthy();
  });

  it("refreshes everything on a pull", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 1, expenses: 0, profit: 1, by_property: [] };
    await renderScreen();
    await screen.findByText("+$1.00");
    server.summary = { revenue: 2, expenses: 0, profit: 2, by_property: [] };
    server.documents = [{ id: "d1", status: "failed" }];
    server.transactions.push(aTransaction({ status: "pending" }));
    server.pendingReceipts = 1;
    await pull();
    expect(await screen.findByText("+$2.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 rent receipt waiting to send" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 transaction to review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 document needs a look" })).toBeTruthy();
  });

  it("says so when a pull fails, and keeps what it last loaded", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 1, expenses: 0, profit: 1, by_property: [] };
    await renderScreen();
    await screen.findByText("+$1.00");
    server.failSummary = true;
    await pull();
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("+$1.00")).toBeTruthy();
  });

  it("updates what's waiting and the numbers when a document finishes being read", async () => {
    const server = startTransactionServer([]);
    server.documents = [{ id: "d1", status: "processing" }];
    server.summary = { revenue: 1, expenses: 0, profit: 1, by_property: [] };
    await renderScreen();
    await screen.findByText("+$1.00");
    server.documents = [{ id: "d1", status: "completed" }];
    server.summary = { revenue: 2, expenses: 0, profit: 2, by_property: [] };
    server.transactions.push(aTransaction({ status: "pending" }));
    await act(async () => {
      await store.dispatch(documentsApi.endpoints.getDocuments.initiate(ALL_DOCUMENTS, { forceRefetch: true, subscribe: false }));
    });
    expect(await screen.findByText("+$2.00")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "1 transaction to review" })).toBeTruthy();
  });

  it("can be pulled to refresh while it's empty", async () => {
    const server = startTransactionServer([]);
    server.summaryYears = [];
    await renderScreen();
    await screen.findByText("Nothing here yet");
    server.summaryYears = [2026];
    await pull();
    expect(await screen.findByText("Approved transactions only.")).toBeTruthy();
  });

  it("gives a viewer no photo button on the empty screen", async () => {
    const server = startTransactionServer([]);
    server.role = "viewer";
    server.summaryYears = [];
    await renderScreen();
    expect(await screen.findByText("Numbers will show up here once someone adds a document.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take a photo" })).toBeNull();
  });

  it("treats a rounding residue as zero", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 0.3, expenses: 0.3, profit: -0.000001, by_property: [] };
    await renderScreen();
    expect(await screen.findByText("$0.00")).toBeTruthy();
    expect(screen.queryByText("You spent more than you earned.")).toBeNull();
  });
});
