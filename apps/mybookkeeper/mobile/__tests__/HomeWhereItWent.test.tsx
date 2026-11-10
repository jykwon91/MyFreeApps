import api from "@platform/core/lib/api";
import { fireEvent, screen } from "@testing-library/react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { holdSummary, pull, renderHome, resetHome } from "../test-support/homeScreen";
import { startTransactionServer } from "../test-support/transactionsServer";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  router: { navigate: (path: string) => mockNavigate(path), push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;
const SPENDING = {
  rental_revenue: 9000,
  utilities: 300,
  maintenance: 1200,
  insurance: 150,
  mortgage_interest: 800,
  taxes: 450,
  cleaning_expense: 100,
};

beforeEach(() => {
  resetHome();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("Home where it went", () => {
  it("shows the five biggest expense categories, biggest first, with the website's labels", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_category: SPENDING };
    await renderHome();
    await screen.findByText("Where it went");
    const rows = screen.getAllByRole("button", { name: /dollars$/ }).map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual([
      "Maintenance, 1,200 dollars",
      "Mortgage Interest, 800 dollars",
      "Taxes, 450 dollars",
      "Utilities, 300 dollars",
      "Insurance, 150 dollars",
    ]);
    expect(screen.getByText("$1,200.00")).toBeTruthy();
    expect(screen.queryByText(/Rental Revenue/)).toBeNull();
    expect(screen.queryByText(/Cleaning Expense/)).toBeNull();
  });

  it("draws each bar against the biggest", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_category: { maintenance: 1000, utilities: 250 } };
    await renderHome();
    await screen.findByText("Where it went");
    const widths = screen.getAllByTestId("category-bar").map((bar) => bar.props.style.width);
    expect(widths).toEqual(["100%", "25%"]);
  });

  it("opens the period's approved expenses in the category tapped, or all of them", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_category: SPENDING };
    await renderHome();
    await fireEvent.press(await screen.findByRole("button", { name: "Utilities, 300 dollars" }));
    expect(mockNavigate).toHaveBeenLastCalledWith(
      "/money?segment=transactions&view=all&period=thisMonth&month=&from=&to=&type=expense&property=&category=utilities&vendor=&status=approved",
    );
    await fireEvent.press(screen.getByRole("button", { name: "See all expenses" }));
    expect(mockNavigate).toHaveBeenLastCalledWith(
      "/money?segment=transactions&view=all&period=thisMonth&month=&from=&to=&type=expense&property=&category=&vendor=&status=approved",
    );
  });

  it("isn't there when nothing was spent", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 5, expenses: 0, profit: 5, by_category: { rental_revenue: 5, utilities: -20 } };
    await renderHome();
    await screen.findByText("+$5.00");
    expect(screen.queryByText("Where it went")).toBeNull();
  });

  it("holds its place while the numbers load", async () => {
    startTransactionServer([]);
    holdSummary();
    await renderHome();
    expect(await screen.findByLabelText("Loading where your money went")).toBeTruthy();
    expect(screen.queryByText("See all expenses")).toBeNull();
  });

  it("comes back with the numbers when they're retried", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_category: SPENDING };
    server.failSummary = true;
    await renderHome();
    expect(await screen.findByText("I couldn't load this month's numbers.")).toBeTruthy();
    expect(screen.queryByText("Where it went")).toBeNull();
    server.failSummary = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Where it went")).toBeTruthy();
  });

  it("keeps the last categories when a pull fails, and updates on a pull that works", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_category: SPENDING };
    await renderHome();
    await screen.findByText("Where it went");
    server.failSummary = true;
    await pull();
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maintenance, 1,200 dollars" })).toBeTruthy();
    server.failSummary = false;
    server.summary = { by_category: { ...SPENDING, maintenance: 5000 } };
    await pull();
    expect(await screen.findByRole("button", { name: "Maintenance, 5,000 dollars" })).toBeTruthy();
  });
});
