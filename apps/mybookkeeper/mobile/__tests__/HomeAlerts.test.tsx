import api from "@platform/core/lib/api";
import { fireEvent, screen } from "@testing-library/react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { policiesAboveMarket, renewalsDue, utilityPlansAboveMarket } from "../test-support/homeAlerts";
import { failRequests, holdRequests, pull, renderHome, resetHome } from "../test-support/homeScreen";
import { startTransactionServer } from "../test-support/transactionsServer";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  router: { navigate: (path: string) => mockNavigate(path), push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const ALERT_URLS = ["/utility-plans/renewal-alerts", "/utility-plans/rate-comparison", "/insurance-policies/premium-comparison"];
const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetHome();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("Home alerts", () => {
  it("shows a row for each check that costs money, each opening its page", async () => {
    const server = startTransactionServer([]);
    server.renewalAlerts = renewalsDue(1, 0);
    server.rateComparison = utilityPlansAboveMarket(2);
    server.premiumComparison = policiesAboveMarket(1);
    await renderHome();
    await fireEvent.press(await screen.findByRole("button", { name: "1 utility plan has lapsed" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/utility-plans/renewals");
    await fireEvent.press(screen.getByRole("button", { name: "2 utility plans priced above market" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/utility-plans/rate-check");
    await fireEvent.press(screen.getByRole("button", { name: "1 insurance policy priced above market" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/insurance");
  });

  it("asks for renewals as of the phone's own day", async () => {
    const server = startTransactionServer([]);
    await renderHome();
    await screen.findByText("You're all caught up.");
    const renewals = server.requests.find((request) => request.url === "/utility-plans/renewal-alerts");
    expect(renewals?.params).toEqual({ today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it("words renewals by what's happening to them", async () => {
    const server = startTransactionServer([]);
    server.renewalAlerts = renewalsDue(0, 2);
    await renderHome();
    expect(await screen.findByRole("button", { name: "2 utility plans end within 45 days" })).toBeTruthy();
    server.renewalAlerts = renewalsDue(1, 1);
    await pull();
    expect(await screen.findByRole("button", { name: "2 utility plans need renewing" })).toBeTruthy();
  });

  it("isn't there at all when nothing needs attention", async () => {
    startTransactionServer([]);
    await renderHome();
    await screen.findByText("You're all caught up.");
    expect(screen.queryByTestId("home-alerts")).toBeNull();
    expect(screen.queryByTestId("home-alerts-skeleton")).toBeNull();
  });

  it("shows a skeleton row while the checks load", async () => {
    startTransactionServer([]);
    holdRequests(...ALERT_URLS);
    await renderHome();
    expect(await screen.findByTestId("home-alerts-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("home-alerts")).toBeNull();
  });

  it("says which check failed, keeps the others, and retries", async () => {
    const server = startTransactionServer([]);
    server.premiumComparison = policiesAboveMarket(1);
    server.rateComparison = utilityPlansAboveMarket(1);
    const stopFailing = failRequests("/utility-plans/rate-comparison");
    await renderHome();
    expect(await screen.findByText("I couldn't compare your utility rates to the market.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 insurance policy priced above market" })).toBeTruthy();
    stopFailing();
    await fireEvent.press(screen.getAllByRole("button", { name: "Try again" })[0]);
    expect(await screen.findByRole("button", { name: "1 utility plan priced above market" })).toBeTruthy();
    expect(screen.queryByText("I couldn't compare your utility rates to the market.")).toBeNull();
  });

  it("says so once when several checks fail", async () => {
    startTransactionServer([]);
    failRequests(...ALERT_URLS);
    await renderHome();
    expect(await screen.findByText("I couldn't check your utility plans and insurance.")).toBeTruthy();
  });

  it("keeps the last rows when a pull fails, under the offline banner", async () => {
    const server = startTransactionServer([]);
    server.premiumComparison = policiesAboveMarket(2);
    await renderHome();
    await screen.findByRole("button", { name: "2 insurance policies priced above market" });
    failRequests("/insurance-policies/premium-comparison");
    await pull();
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "2 insurance policies priced above market" })).toBeTruthy();
    expect(screen.queryByText("I couldn't compare your insurance premiums to the market.")).toBeNull();
  });

  it("checks again on a pull", async () => {
    const server = startTransactionServer([]);
    await renderHome();
    await screen.findByText("You're all caught up.");
    server.rateComparison = utilityPlansAboveMarket(1);
    await pull();
    expect(await screen.findByRole("button", { name: "1 utility plan priced above market" })).toBeTruthy();
  });
});
