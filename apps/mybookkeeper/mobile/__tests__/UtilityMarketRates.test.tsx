import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { MARKET_RATE_MESSAGES } from "../src/constants/marketRates";
import MarketRateFormScreen from "../src/features/utilityPlans/MarketRateFormScreen";
import MarketRatesScreen from "../src/features/utilityPlans/MarketRatesScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aBenchmark } from "../test-support/aMarketRateBenchmark";
import { startUtilityServer, writesTo } from "../test-support/utilityPlansServer";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPreventRemove = { active: false };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), canGoBack: () => true, push: (path: string) => mockPush(path), replace: jest.fn() },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove.active = active;
  },
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;
beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  mockPreventRemove.active = false;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function show(element: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

describe("MarketRatesScreen", () => {
  it("shows every service with its recorded rate, or that none is", async () => {
    startUtilityServer({ benchmarks: [aBenchmark(), aBenchmark({ id: "b2", service_type: "internet", rate_cents_per_kwh: null, monthly_cents: 6999, is_stale: true })] });
    await show(<MarketRatesScreen />);
    await screen.findByText("11¢/kWh");
    expect(screen.getByText("$69.99/mo")).toBeTruthy();
    expect(screen.getAllByText(MARKET_RATE_MESSAGES.notRecorded)).toHaveLength(2);
    expect(screen.getByText(/worth rechecking/)).toBeTruthy();
  });

  it("opens the form for the service a writer taps", async () => {
    startUtilityServer({ benchmarks: [aBenchmark()] });
    await show(<MarketRatesScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Water/ }));
    expect(mockPush).toHaveBeenCalledWith("/utility-plans/market-rates/water");
  });

  it("lets a viewer look but not edit", async () => {
    startUtilityServer({ role: "viewer", benchmarks: [aBenchmark()] });
    await show(<MarketRatesScreen />);
    await screen.findByText("11¢/kWh");
    expect(screen.queryByRole("button", { name: /^Electricity/ })).toBeNull();
  });

  it("offers a retry when it couldn't load", async () => {
    startUtilityServer({ benchmarks: "fail" });
    await show(<MarketRatesScreen />);
    expect(await screen.findByText(MARKET_RATE_MESSAGES.couldntLoad)).toBeTruthy();
  });
});

describe("MarketRateFormScreen", () => {
  it("tells a viewer they cannot record a rate", async () => {
    startUtilityServer({ role: "viewer" });
    await show(<MarketRateFormScreen serviceType="electricity" />);
    expect(await screen.findByText(MARKET_RATE_MESSAGES.viewOnlyHeading)).toBeTruthy();
  });

  it("does not know a service it was not given", async () => {
    startUtilityServer();
    await show(<MarketRateFormScreen serviceType="steam" />);
    expect(await screen.findByText(MARKET_RATE_MESSAGES.unknownService)).toBeTruthy();
  });

  it("asks for a rate above zero before sending anything", async () => {
    const server = startUtilityServer();
    await show(<MarketRateFormScreen serviceType="electricity" />);
    await fireEvent.press(await screen.findByRole("button", { name: MARKET_RATE_MESSAGES.save }));
    expect(await screen.findByText(MARKET_RATE_MESSAGES.figureRequired)).toBeTruthy();
    expect(writesTo(server, "put")).toHaveLength(0);
  });

  it("saves a metered rate as typed, says so, and leaves", async () => {
    const server = startUtilityServer();
    await show(<MarketRateFormScreen serviceType="electricity" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MARKET_RATE_MESSAGES.figureMetered.replace(/[()/]/g, "\\$&")}`)), "11.25");
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${MARKET_RATE_MESSAGES.source}`)), "  Power to Choose ");
    await fireEvent.press(screen.getByRole("button", { name: MARKET_RATE_MESSAGES.save }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const put = writesTo(server, "put")[0];
    expect(put.url).toBe("/market-rate-benchmarks/electricity");
    expect(JSON.parse(String(put.data))).toMatchObject({ rate_cents_per_kwh: "11.25", source: "Power to Choose", notes: null });
    expect(JSON.parse(String(put.data))).not.toHaveProperty("monthly_cents");
    expect(await screen.findByText(MARKET_RATE_MESSAGES.saved)).toBeTruthy();
  });

  it("saves internet as whole cents a month", async () => {
    const server = startUtilityServer();
    await show(<MarketRateFormScreen serviceType="internet" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MARKET_RATE_MESSAGES.figureFlat.replace(/[()$]/g, "\\$&")}`)), "69.99");
    await fireEvent.press(screen.getByRole("button", { name: MARKET_RATE_MESSAGES.save }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const body = JSON.parse(String(writesTo(server, "put")[0].data));
    expect(body.monthly_cents).toBe(6999);
    expect(body).not.toHaveProperty("rate_cents_per_kwh");
  });

  it("opens on the rate already recorded and offers to remove it", async () => {
    startUtilityServer({ benchmarks: [aBenchmark()] });
    await show(<MarketRateFormScreen serviceType="electricity" />);
    const figure = await screen.findByLabelText(new RegExp(`^${MARKET_RATE_MESSAGES.figureMetered.replace(/[()/]/g, "\\$&")}`));
    expect(figure.props.value).toBe("11.0000");
    expect(screen.getByRole("button", { name: MARKET_RATE_MESSAGES.remove })).toBeTruthy();
  });

  it("offers no remove when nothing is recorded", async () => {
    startUtilityServer();
    await show(<MarketRateFormScreen serviceType="water" />);
    await screen.findByRole("button", { name: MARKET_RATE_MESSAGES.save });
    expect(screen.queryByRole("button", { name: MARKET_RATE_MESSAGES.remove })).toBeNull();
  });

  it("asks before removing, then removes and leaves", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const server = startUtilityServer({ benchmarks: [aBenchmark()] });
    await show(<MarketRateFormScreen serviceType="electricity" />);
    await fireEvent.press(await screen.findByRole("button", { name: MARKET_RATE_MESSAGES.remove }));
    expect(writesTo(server, "delete")).toHaveLength(0);
    await (alert.mock.calls[0][2] ?? []).find((button) => button.text === "Remove")?.onPress?.();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesTo(server, "delete")[0].url).toBe("/market-rate-benchmarks/electricity");
    expect(await screen.findByText(MARKET_RATE_MESSAGES.removed)).toBeTruthy();
  });

  it("shows the latest failure, so a failed remove is not hidden behind an earlier failed save", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const server = startUtilityServer({ benchmarks: [aBenchmark()], write: 500 });
    await show(<MarketRateFormScreen serviceType="electricity" />);
    const label = new RegExp(`^${MARKET_RATE_MESSAGES.figureMetered.replace(/[()/]/g, "\\$&")}`);
    await fireEvent.changeText(await screen.findByLabelText(label), "12");
    await fireEvent.press(screen.getByRole("button", { name: MARKET_RATE_MESSAGES.save }));
    expect(await screen.findByText("I couldn't save that. Want to try again?")).toBeTruthy();
    server.write = 403;
    await fireEvent.press(screen.getByRole("button", { name: MARKET_RATE_MESSAGES.remove }));
    await (alert.mock.calls[0][2] ?? []).find((button) => button.text === MARKET_RATE_MESSAGES.confirmRemove)?.onPress?.();
    expect(await screen.findByText("You have view-only access, so I can't delete this.")).toBeTruthy();
    expect(screen.queryByText("I couldn't save that. Want to try again?")).toBeNull();
  });

  it("guards leaving once something changed", async () => {
    startUtilityServer();
    await show(<MarketRateFormScreen serviceType="electricity" />);
    const figure = await screen.findByLabelText(new RegExp(`^${MARKET_RATE_MESSAGES.figureMetered.replace(/[()/]/g, "\\$&")}`));
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(figure, "11");
    expect(mockPreventRemove.active).toBe(true);
  });

  it.each([
    [403, "You have view-only access, so I can't save this."],
    [422, "Something in there isn't right. Check the fields and try again."],
    [500, "I couldn't save that. Want to try again?"],
  ] as const)("keeps the typing and shows fixed copy for %s", async (write, copy) => {
    startUtilityServer({ benchmarks: [aBenchmark()], write });
    await show(<MarketRateFormScreen serviceType="electricity" />);
    const label = new RegExp(`^${MARKET_RATE_MESSAGES.figureMetered.replace(/[()/]/g, "\\$&")}`);
    await fireEvent.changeText(await screen.findByLabelText(label), "12");
    await fireEvent.press(screen.getByRole("button", { name: MARKET_RATE_MESSAGES.save }));
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByText(/raw server text/)).toBeNull();
    expect(screen.getByLabelText(label).props.value).toBe("12");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
