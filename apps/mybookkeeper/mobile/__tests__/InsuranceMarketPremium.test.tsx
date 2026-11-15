import api from "@platform/core/lib/api";
import { fireEvent, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { BENCHMARK_FORM_PROBLEMS } from "@mybookkeeper/api-client/constants/benchmarkForm";
import MarketPremiumScreen from "../src/features/insurance/MarketPremiumScreen";
import { aBenchmark, lastInsuranceWrite, startInsuranceServer } from "../test-support/insuranceServer";
import { renderInsurance, resetInsuranceStore } from "../test-support/renderInsurance";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetInsuranceStore();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

function choose(buttonText: string) {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.text === buttonText)?.onPress?.());
}

async function fillAmounts(premium = "1200", coverage = "400000") {
  await fireEvent.changeText(await screen.findByLabelText("Annual premium (USD), required"), premium);
  await fireEvent.changeText(screen.getByLabelText("Dwelling coverage (USD), required"), coverage);
}

describe("market premium", () => {
  it("says nothing is recorded and offers to record one", async () => {
    startInsuranceServer();
    await renderInsurance(<MarketPremiumScreen />);
    expect(await screen.findByText(/No market premium recorded/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record a market premium" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove the market premium" })).toBeNull();
  });

  it("shows the recorded figure and flags a stale one", async () => {
    startInsuranceServer({ benchmark: aBenchmark({ is_stale: true }) });
    await renderInsurance(<MarketPremiumScreen />);
    expect(await screen.findByText("Comparing against")).toBeTruthy();
    expect(screen.getByText("Worth rechecking")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update the market premium" })).toBeTruthy();
  });

  it("records a figure and says so", async () => {
    const server = startInsuranceServer();
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Record a market premium" }));
    await fillAmounts();
    await fireEvent.changeText(screen.getByLabelText("Region"), "Houston, TX");
    await fireEvent.press(screen.getByRole("button", { name: "Save market premium" }));
    expect(await screen.findByText("Market premium saved.")).toBeTruthy();
    expect(lastInsuranceWrite(server)).toMatchObject({
      route: "PUT /insurance-benchmarks",
      body: { annual_premium_cents: 120000, coverage_amount_cents: 40000000, region_label: "Houston, TX" },
    });
    expect(await screen.findByText("Comparing against")).toBeTruthy();
  });

  it("asks for both amounts instead of sending", async () => {
    const server = startInsuranceServer();
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Record a market premium" }));
    await fireEvent.changeText(await screen.findByLabelText("Annual premium (USD), required"), "1200");
    await fireEvent.press(screen.getByRole("button", { name: "Save market premium" }));
    expect(await screen.findByText(BENCHMARK_FORM_PROBLEMS.coverageRequired)).toBeTruthy();
    expect(lastInsuranceWrite(server)).toBeNull();
  });

  it.each([
    ["10000001", "400000", BENCHMARK_FORM_PROBLEMS.premiumTooHigh],
    ["1200", "1000000001", BENCHMARK_FORM_PROBLEMS.coverageTooHigh],
    ["1200.555", "400000", BENCHMARK_FORM_PROBLEMS.moneyTooPrecise],
  ])("points at premium %s / coverage %s and sends nothing", async (premium, coverage, message) => {
    const server = startInsuranceServer();
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Record a market premium" }));
    await fillAmounts(premium, coverage);
    await fireEvent.press(screen.getByRole("button", { name: "Save market premium" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(lastInsuranceWrite(server)).toBeNull();
  });

  it("stops region, source and notes at the backend's limits", async () => {
    startInsuranceServer();
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Record a market premium" }));
    expect((await screen.findByLabelText("Region")).props.maxLength).toBe(120);
    expect(screen.getByLabelText("Where it came from").props.maxLength).toBe(255);
    expect(screen.getByLabelText("Notes").props.maxLength).toBe(5000);
  });

  it("starts an update from the stored figure", async () => {
    startInsuranceServer({ benchmark: aBenchmark() });
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Update the market premium" }));
    expect((await screen.findByLabelText("Annual premium (USD), required")).props.value).toBe("1200.00");
  });

  it("asks before throwing away an edit", async () => {
    startInsuranceServer();
    const alert = choose("Discard");
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Record a market premium" }));
    await fillAmounts();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alert).toHaveBeenCalledWith("Discard your changes?", "I haven't saved them yet.", expect.any(Array));
    expect(screen.queryByRole("button", { name: "Save market premium" })).toBeNull();
  });

  it.each([
    [403, "You have view-only access, so I can't change the market premium."],
    [422, "I couldn't save that. Check the details and try again."],
    [500, "I couldn't save that. Want to try again?"],
    ["offline" as const, "I can't reach the server, so I couldn't save that. Your details are still here."],
  ])("a %s on save says %s and keeps the form", async (failure, message) => {
    startInsuranceServer({ failures: { "PUT /insurance-benchmarks": failure } });
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Record a market premium" }));
    await fillAmounts();
    await fireEvent.press(screen.getByRole("button", { name: "Save market premium" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText("Annual premium (USD), required").props.value).toBe("1200");
  });

  it("confirms before removing, then removes", async () => {
    const server = startInsuranceServer({ benchmark: aBenchmark() });
    const alert = choose("Remove the market premium");
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove the market premium" }));
    expect(alert).toHaveBeenCalledWith("Remove the market premium?", expect.any(String), expect.any(Array));
    expect(await screen.findByText("Market premium removed.")).toBeTruthy();
    expect(lastInsuranceWrite(server)?.route).toBe("DELETE /insurance-benchmarks");
    expect(await screen.findByText(/No market premium recorded/)).toBeTruthy();
  });

  it("keeps it when removal is cancelled", async () => {
    const server = startInsuranceServer({ benchmark: aBenchmark() });
    choose("Cancel");
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove the market premium" }));
    expect(lastInsuranceWrite(server)).toBeNull();
  });

  it.each([
    [403, "You have view-only access, so I can't change the market premium."],
    [404, "That market premium is already gone."],
    [500, "I couldn't remove that. Want to try again?"],
    ["offline" as const, "I can't reach the server, so I couldn't remove it. Want to try again?"],
  ])("a %s on remove says %s", async (failure, message) => {
    startInsuranceServer({ benchmark: aBenchmark(), failures: { "DELETE /insurance-benchmarks": failure } });
    choose("Remove the market premium");
    await renderInsurance(<MarketPremiumScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove the market premium" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("Comparing against")).toBeTruthy();
  });

  it("shows a viewer the figure but no way to change it", async () => {
    startInsuranceServer({ role: "viewer", benchmark: aBenchmark() });
    await renderInsurance(<MarketPremiumScreen />);
    await screen.findByText("Comparing against");
    expect(screen.queryByRole("button", { name: "Update the market premium" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove the market premium" })).toBeNull();
  });

  it("offers a retry when it won't load", async () => {
    startInsuranceServer({ failures: { "GET /insurance-benchmarks": 500 } });
    await renderInsurance(<MarketPremiumScreen />);
    expect(await screen.findByText("I couldn't load the market premium.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows a skeleton while loading", async () => {
    startInsuranceServer();
    api.defaults.adapter = ((config: { url?: string }) => (config.url === "/insurance-benchmarks" ? new Promise(() => undefined) : Promise.resolve({ data: [{ id: "w1", name: "Mine", org_role: "owner" }], status: 200, statusText: "", headers: {}, config }))) as never;
    await renderInsurance(<MarketPremiumScreen />);
    expect(await screen.findByTestId("market-premium-skeleton")).toBeTruthy();
  });
});
