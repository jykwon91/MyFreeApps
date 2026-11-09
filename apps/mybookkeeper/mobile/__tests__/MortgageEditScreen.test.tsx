import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../src/constants/mortgageForm";
import MortgageEditScreen from "../src/features/mortgages/MortgageEditScreen";
import MortgageFormScreen from "../src/features/mortgages/MortgageFormScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { holdWrites } from "../test-support/holdWrites";

const mockBack = jest.fn();
const mockPreventRemove = { active: false };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), canGoBack: () => true, replace: jest.fn() },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove.active = active;
  },
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;

const loan: Mortgage = {
  id: "m1",
  user_id: "u1",
  organization_id: "o1",
  property_id: "pr1",
  property_name: "Oak Street",
  source_document_id: null,
  lender: "First Bank",
  account_number: null,
  current_balance_cents: 41_200_000,
  statement_date: "2026-08-13",
  original_principal_cents: null,
  interest_rate: "2.990",
  rate_type: "fixed",
  fixed_until: null,
  maturity_date: null,
  term_months: null,
  monthly_principal_cents: null,
  monthly_interest_cents: null,
  monthly_escrow_cents: null,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

interface Request {
  method?: string;
  url?: string;
  data?: unknown;
}

function startServer({ role = "owner", write = 200 }: { role?: string; write?: number | "offline" } = {}) {
  const requests: Request[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(config);
    const ok = (data: unknown) => ({ data, status: 200, statusText: "OK", headers: {}, config });
    if (config.url === "/organizations") return ok([{ id: "w1", name: "Mine", org_role: role }]);
    if (config.method?.toLowerCase() === "get") return config.url === "/properties" ? ok([{ id: "pr1", name: "Oak Street" }]) : ok(loan);
    if (write === "offline") return Promise.reject(new Error("Network Error"));
    if (write !== 200) return Promise.reject({ response: { status: write, data: { detail: "raw server text" } }, config, isAxiosError: true });
    return ok(loan);
  };
  api.defaults.adapter = adapter;
  return requests;
}

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

async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

const writes = (requests: Request[]) => requests.filter((request) => request.method?.toLowerCase() === "patch");

describe("editing a mortgage", () => {
  it("saves a changed rate, says so, and leaves", async () => {
    const requests = startServer();
    await show(<MortgageEditScreen id="m1" />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.rate), "6.5");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveEdit }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(JSON.parse(String(writes(requests)[0].data))).toMatchObject({ interest_rate: "6.5" });
    expect(await screen.findByText(MESSAGES.updated)).toBeTruthy();
  });

  it("points at a rate the server would refuse, without sending it", async () => {
    const requests = startServer();
    await show(<MortgageEditScreen id="m1" />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.rate), "30");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveEdit }));
    expect(await screen.findByText(/above 0 and below 25/)).toBeTruthy();
    expect(writes(requests)).toHaveLength(0);
  });

  it("guards leaving once something changed, and asks before discarding", async () => {
    startServer();
    await show(<MortgageEditScreen id="m1" />);
    const rate = await screen.findByLabelText(MESSAGES.rate);
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(rate, "6.5");
    expect(mockPreventRemove.active).toBe(true);
  });

  it("shows busy on the button at once and blocks a second press while saving", async () => {
    const requests = startServer();
    holdWrites();
    await show(<MortgageEditScreen id="m1" />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.rate), "6.5");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveEdit }));
    expect(await screen.findByText(MESSAGES.saving)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saving }));
    expect(requests.filter((r) => r.method?.toLowerCase() === "patch")).toHaveLength(0);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each([
    [403, MESSAGES.viewOnly],
    [404, MESSAGES.gone],
    [409, MESSAGES.retry],
    [413, MESSAGES.retry],
    [415, MESSAGES.retry],
    [422, MESSAGES.invalid],
    [500, MESSAGES.retry],
    ["offline", MESSAGES.lostConnection],
  ] as const)("keeps the typing and shows fixed copy for %s", async (write, copy) => {
    startServer({ write });
    await show(<MortgageEditScreen id="m1" />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.rate), "6.5");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveEdit }));
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByText(/raw server text/)).toBeNull();
    expect(screen.getByLabelText(MESSAGES.rate).props.value).toBe("6.5");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("tells a viewer they cannot edit", async () => {
    startServer({ role: "viewer" });
    await show(<MortgageEditScreen id="m1" />);
    expect(await screen.findByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.saveEdit })).toBeNull();
  });
});

describe("adding a mortgage", () => {
  it("tells a viewer they cannot add", async () => {
    startServer({ role: "viewer" });
    await show(<MortgageFormScreen />);
    expect(await screen.findByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
  });

  it("asks for the property before sending anything", async () => {
    const requests = startServer();
    await show(<MortgageFormScreen />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.rate), "6.5");
    await fireEvent.press(screen.getByRole("radio", { name: "Fixed for the life of the loan" }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveNew }));
    expect(await screen.findByText(MESSAGES.propertyRequired)).toBeTruthy();
    expect(requests.filter((r) => r.method?.toLowerCase() === "post")).toHaveLength(0);
  });

  it("adds the loan, then leaves", async () => {
    const requests = startServer();
    await show(<MortgageFormScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Property/));
    await fireEvent.press(await screen.findByRole("radio", { name: "Oak Street" }));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.rate), "6.5");
    await fireEvent.press(screen.getByRole("radio", { name: "Fixed for the life of the loan" }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveNew }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const post = requests.find((r) => r.method?.toLowerCase() === "post");
    expect(JSON.parse(String(post?.data))).toMatchObject({ property_id: "pr1", interest_rate: "6.5", rate_type: "fixed" });
  });

  it("warns that a failed create may have saved", async () => {
    startServer({ write: 500 });
    await show(<MortgageFormScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Property/));
    await fireEvent.press(await screen.findByRole("radio", { name: "Oak Street" }));
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.rate), "6.5");
    await fireEvent.press(screen.getByRole("radio", { name: "Fixed for the life of the loan" }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveNew }));
    expect(await screen.findByText(MESSAGES.createUnsure)).toBeTruthy();
  });
});
