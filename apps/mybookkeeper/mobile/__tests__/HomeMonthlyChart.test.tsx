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
const aMonth = (month: string, revenue: number, expenses: number) => ({ month, revenue, expenses, profit: revenue - expenses });
const SPRING = [aMonth("2026-03", 4000, 1200.5), aMonth("2026-04", 3800, 900)];

beforeEach(() => {
  resetHome();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("Home monthly chart", () => {
  it("draws revenue against expenses with a spoken summary and one button per month", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 7800, expenses: 2100.5, profit: 5699.5, by_month: SPRING };
    await renderHome();
    const chart = await screen.findByRole("image", { name: "Revenue and expenses by month, March 2026 to April 2026. Approved transactions only." });
    await fireEvent(chart, "layout", { nativeEvent: { layout: { width: 320, height: 160 } } });
    expect(screen.getByTestId("home-monthly-chart")).toBeTruthy();
    expect(screen.getByText("Mar")).toBeTruthy();
    expect(screen.getByText("Apr")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revenue 4,000 dollars, expenses 1,200 dollars and 50 cents, March 2026" })).toBeTruthy();
    expect(screen.getAllByText(/^\$\d+k$/).length).toBeGreaterThan(0);
  });

  it("opens the approved transactions of the month tapped", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_month: SPRING };
    await renderHome();
    await fireEvent.press(await screen.findByRole("button", { name: /April 2026$/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/money?segment=transactions&view=all&period=all&month=2026-04&from=&to=&type=&property=&category=&vendor=&status=approved&tax=&sort=&order=");
  });

  it("puts a quiet month back as zero rather than closing the gap", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_month: [aMonth("2026-01", 10, 0), aMonth("2026-03", 20, 0)] };
    await renderHome();
    expect(await screen.findByRole("button", { name: "Revenue 0 dollars, expenses 0 dollars, February 2026" })).toBeTruthy();
  });

  it("isn't there with fewer than two months", async () => {
    const server = startTransactionServer([]);
    server.summary = { revenue: 5, expenses: 0, profit: 5, by_month: [aMonth("2026-03", 5, 0)] };
    await renderHome();
    await screen.findByText("+$5.00");
    expect(screen.queryByText("Month by month")).toBeNull();
  });

  it("holds the chart's place while a longer period loads, but not for this month", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_month: SPRING };
    await renderHome();
    await screen.findByText("Month by month");
    holdSummary();
    await fireEvent.press(screen.getByRole("tab", { name: "This year" }));
    expect(await screen.findByLabelText("Loading the months")).toBeTruthy();
    expect(screen.queryByTestId("home-monthly-chart")).toBeNull();
  });

  it("doesn't hold a chart's place while this month loads", async () => {
    startTransactionServer([]);
    holdSummary();
    await renderHome();
    await screen.findByTestId("home-numbers-skeleton");
    expect(screen.queryByLabelText("Loading the months")).toBeNull();
  });

  it("comes back with the numbers when they're retried", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_month: SPRING };
    server.failSummary = true;
    await renderHome();
    expect(await screen.findByText("I couldn't load this month's numbers.")).toBeTruthy();
    expect(screen.queryByText("Month by month")).toBeNull();
    server.failSummary = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Month by month")).toBeTruthy();
  });

  it("keeps the last chart when a pull fails, and redraws on a pull that works", async () => {
    const server = startTransactionServer([]);
    server.summary = { by_month: SPRING };
    await renderHome();
    await screen.findByText("Month by month");
    server.failSummary = true;
    await pull();
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: /April 2026$/ })).toBeTruthy();
    server.failSummary = false;
    server.summary = { by_month: [...SPRING, aMonth("2026-05", 1, 1)] };
    await pull();
    expect(await screen.findByRole("button", { name: /May 2026$/ })).toBeTruthy();
  });
});
