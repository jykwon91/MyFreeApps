import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { MORTGAGE_RATE_MESSAGES as MESSAGES } from "../src/constants/mortgageRates";
import RateWatchScreen from "../src/features/mortgages/RateWatchScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path) } }));

const originalAdapter = api.defaults.adapter;

const watch = (outlooks: unknown[]) => ({
  outlooks,
  survey_30_year_pct: "6.80",
  survey_15_year_pct: "6.10",
  survey_observed_on: "2026-11-05",
  checked_mortgage_count: outlooks.length,
  feed_unavailable_reason: null,
});

function startServer(rateWatch: unknown | "fail", role = "owner") {
  const calls = { rateWatch: 0 };
  const adapter: AxiosAdapter = async (config) => {
    const ok = (data: unknown) => ({ data, status: 200, statusText: "OK", headers: {}, config });
    if (config.url === "/organizations") return ok([{ id: "w1", name: "Mine", org_role: role }]);
    calls.rateWatch += 1;
    if (rateWatch === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    return ok(rateWatch);
  };
  api.defaults.adapter = adapter;
  return calls;
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function show() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <RateWatchScreen />
      </ToastProvider>
    </Provider>,
  );
}

describe("RateWatchScreen", () => {
  it("does not reach the rate feed until asked", async () => {
    const calls = startServer(watch([]));
    await show();
    expect(await screen.findByText(MESSAGES.idle)).toBeTruthy();
    expect(calls.rateWatch).toBe(0);
  });

  it("offers to add the first mortgage when there is none", async () => {
    startServer(watch([]));
    await show();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.check }));
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.addMortgage }));
    expect(mockPush).toHaveBeenCalledWith("/mortgages/new");
  });

  it("does not offer a viewer the add button", async () => {
    startServer(watch([]), "viewer");
    await show();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.check }));
    await screen.findByText(MESSAGES.empty);
    expect(screen.queryByRole("button", { name: MESSAGES.addMortgage })).toBeNull();
  });

  it("says the feed is down in fixed words, and a check again recovers", async () => {
    const calls = startServer("fail");
    await show();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.check }));
    expect(await screen.findByText(MESSAGES.error)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.checkAgain }));
    await waitFor(() => expect(calls.rateWatch).toBe(2));
  });
});
