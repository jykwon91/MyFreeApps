import { mortgagesApi } from "@mybookkeeper/api-client/store/mortgagesApi";
import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { MORTGAGE_MESSAGES } from "../src/constants/mortgages";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import MortgageDetailScreen from "../src/features/mortgages/MortgageDetailScreen";
import { balanceLine, maskedLoanNumber, paymentLines, rateFixedLine, sortedMortgages } from "../src/features/mortgages/mortgageDisplay";
import MortgagesScreen from "../src/features/mortgages/MortgagesScreen";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));

const originalAdapter = api.defaults.adapter;

function aLoan(overrides: Partial<Mortgage> = {}): Mortgage {
  return {
    id: "m1",
    user_id: "u1",
    organization_id: "o1",
    property_id: "pr1",
    property_name: "Oak Street",
    source_document_id: null,
    lender: "First Bank",
    account_number: "1234564944",
    current_balance_cents: 41_200_000,
    statement_date: "2026-08-13",
    original_principal_cents: 45_000_000,
    interest_rate: "2.990",
    rate_type: "fixed",
    fixed_until: null,
    maturity_date: "2051-09-01",
    term_months: 360,
    monthly_principal_cents: 110_000,
    monthly_interest_cents: 100_000,
    monthly_escrow_cents: 60_000,
    notes: "Autopay on the first",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

type Answer = unknown | "fail" | "gone" | "hold";

function startServer(list: Answer, detail: Answer = aLoan()) {
  const server = { list, detail };
  const adapter: AxiosAdapter = async (config) => {
    const answer = config.url === "/mortgages" ? server.list : server.detail;
    if (answer === "hold") return new Promise(() => undefined);
    if (answer === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    if (answer === "gone") return Promise.reject({ response: { status: 404, data: {} }, config, isAxiosError: true });
    return { data: answer, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
  return server;
}

function aPage(items: Mortgage[], hasMore = false) {
  return { items, total: items.length, has_more: hasMore };
}

async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockClear();
  mockBack.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("maskedLoanNumber", () => {
  it("keeps only the last four", () => {
    expect(maskedLoanNumber("1234564944")).toBe("•••• 4944");
  });

  it("hides a number too short to have a safe last four", () => {
    expect(maskedLoanNumber("1234567")).toBe("••••");
    expect(maskedLoanNumber("12345678")).toBe("•••• 5678");
    expect(maskedLoanNumber("944")).toBe("••••");
  });
});

describe("paymentLines", () => {
  const amounts = (principal: number | null, interest: number | null, escrow: number | null) =>
    paymentLines(aLoan({ monthly_principal_cents: principal, monthly_interest_cents: interest, monthly_escrow_cents: escrow }));

  it("adds principal and interest, shows escrow apart, and totals them", () => {
    expect(amounts(110_000, 100_000, 60_000)).toEqual([
      { label: "Principal and interest", value: "$2,100.00" },
      { label: "Escrow", value: "$600.00" },
      { label: "Total monthly payment", value: "$2,700.00" },
    ]);
  });

  it("adds up on screen when the cents would round apart", () => {
    expect(amounts(10_040, 0, 2_040).map((line) => line.value)).toEqual(["$100.40", "$20.40", "$120.80"]);
  });

  it("gives no total when part of the payment is unknown", () => {
    expect(amounts(110_000, 100_000, null)).toEqual([{ label: "Principal and interest", value: "$2,100.00" }]);
    expect(amounts(110_000, null, 60_000)).toEqual([
      { label: "Principal", value: "$1,100.00" },
      { label: "Escrow", value: "$600.00" },
    ]);
    expect(amounts(null, null, null)).toEqual([]);
  });

  it("shows a real zero", () => {
    expect(amounts(110_000, 100_000, 0)).toContainEqual({ label: "Escrow", value: "$0.00" });
  });
});

describe("balanceLine", () => {
  it("says when the balance was true", () => {
    expect(balanceLine({ current_balance_cents: 41_200_000, statement_date: "2026-08-13" })).toBe("$412,000 as of Aug 13, 2026");
  });

  it("shows a paid off loan, and nothing when unknown", () => {
    expect(balanceLine({ current_balance_cents: 0, statement_date: null })).toBe("$0");
    expect(balanceLine({ current_balance_cents: null, statement_date: null })).toBeNull();
  });
});

describe("rateFixedLine", () => {
  it("speaks only to adjustable loans", () => {
    expect(rateFixedLine({ rate_type: "fixed", fixed_until: "2028-01-01" }, "2026-03-10")).toBeNull();
    expect(rateFixedLine({ rate_type: "arm", fixed_until: null }, "2026-03-10")).toBeNull();
  });

  it("tells a rate still fixed from one that isn't, counting today as fixed", () => {
    expect(rateFixedLine({ rate_type: "arm", fixed_until: "2026-03-10" }, "2026-03-10")).toBe("Rate fixed until Mar 10, 2026");
    expect(rateFixedLine({ rate_type: "arm", fixed_until: "2026-03-09" }, "2026-03-10")).toBe("Rate stopped being fixed on Mar 9, 2026");
  });
});

describe("sortedMortgages", () => {
  it("goes by property, then lender", () => {
    const sorted = sortedMortgages([
      aLoan({ id: "c", property_name: "Pine" }),
      aLoan({ id: "b", property_name: "Oak", lender: "Zeta" }),
      aLoan({ id: "a", property_name: "Oak", lender: "Acme" }),
    ]);
    expect(sorted.map((loan) => loan.id)).toEqual(["a", "b", "c"]);
  });
});

describe("MortgagesScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show(<MortgagesScreen />);
    expect(await screen.findByTestId("mortgages-skeleton")).toBeTruthy();
  });

  it("never shows the loan number in the list, and opens a loan", async () => {
    startServer(aPage([aLoan()]));
    await show(<MortgagesScreen />);
    await screen.findByText("First Bank · 2.990%");
    expect(screen.getByText("$412,000 as of Aug 13, 2026")).toBeTruthy();
    expect(screen.queryByText(/4944/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Oak Street, First Bank, 2.990%, $412,000 as of Aug 13, 2026" }));
    expect(mockPush).toHaveBeenCalledWith("/mortgages/m1");
  });

  it("marks an adjustable rate", async () => {
    startServer(aPage([aLoan({ rate_type: "arm" })]));
    await show(<MortgagesScreen />);
    await screen.findByText("Adjustable");
  });

  it("says when there are more than it shows", async () => {
    startServer(aPage([aLoan()], true));
    await show(<MortgagesScreen />);
    await screen.findByText(MORTGAGE_MESSAGES.moreOnWebsite);
  });

  it("points to the website when there are none", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer(aPage([]));
    await show(<MortgagesScreen />);
    await screen.findByText(MORTGAGE_MESSAGES.noneHeading);
    await fireEvent.press(screen.getByRole("button", { name: "Open on the website" }));
    expect(openURL).toHaveBeenCalledWith(`${WEB_BASE_URL}/mortgages`);
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer("fail");
    await show(<MortgagesScreen />);
    await screen.findByText(MORTGAGE_MESSAGES.couldntLoadList);
    expect(screen.queryByText(MORTGAGE_MESSAGES.noneHeading)).toBeNull();
    server.list = aPage([aLoan()]);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Oak Street");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startServer(aPage([aLoan()]));
    await show(<MortgagesScreen />);
    await screen.findByText("Oak Street");
    server.list = "fail";
    await act(async () => {
      await screen.getByTestId("mortgages-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Oak Street")).toBeTruthy();
  });
});

describe("MortgageDetailScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer(aPage([]), "hold");
    await show(<MortgageDetailScreen id="m1" />);
    expect(await screen.findByTestId("mortgage-detail-skeleton")).toBeTruthy();
  });

  it("shows the loan", async () => {
    startServer(aPage([]));
    await show(<MortgageDetailScreen id="m1" />);
    await screen.findByText("Oak Street");
    for (const text of ["First Bank", "$412,000 as of Aug 13, 2026", "2.990%", "$2,100.00", "$600.00", "$2,700.00", "Sep 1, 2051", "30 years", "$450,000", "Autopay on the first"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("keeps the loan number hidden until asked, and hides it again", async () => {
    startServer(aPage([]));
    await show(<MortgageDetailScreen id="m1" />);
    await screen.findByText("•••• 4944");
    expect(screen.queryByText("1234564944")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: MORTGAGE_MESSAGES.showLoanNumberName }));
    expect(screen.getByText("1234564944")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MORTGAGE_MESSAGES.hideLoanNumberName }));
    expect(screen.queryByText("1234564944")).toBeNull();
  });

  it("treats a blank loan number as none, and ignores stray spaces", async () => {
    startServer(aPage([]), aLoan({ account_number: "   " }));
    await show(<MortgageDetailScreen id="m1" />);
    await screen.findByText("Oak Street");
    expect(screen.queryByText("Loan number")).toBeNull();

    store.dispatch(baseApi.util.resetApiState());
    startServer(aPage([]), aLoan({ account_number: " 1234564944 " }));
    await show(<MortgageDetailScreen id="m2" />);
    await screen.findByText("•••• 4944");
  });

  it("leaves out what the loan doesn't have", async () => {
    startServer(aPage([]), aLoan({
      lender: null, account_number: null, current_balance_cents: null, statement_date: null, original_principal_cents: null, interest_rate: null,
      maturity_date: null, term_months: null, monthly_principal_cents: null, monthly_interest_cents: null, monthly_escrow_cents: null, notes: null,
    }));
    await show(<MortgageDetailScreen id="m1" />);
    await screen.findByText("Oak Street");
    for (const label of ["Balance", "Interest rate", "Principal and interest", "Escrow", "Loan number", "Loan ends", "Loan length", "Original loan", "Notes"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("says how long an adjustable rate is fixed", async () => {
    startServer(aPage([]), aLoan({ rate_type: "arm", fixed_until: "2099-06-01" }));
    await show(<MortgageDetailScreen id="m1" />);
    await screen.findByText("Rate fixed until Jun 1, 2099");
    expect(screen.getByText("Adjustable")).toBeTruthy();
  });

  it("says when the loan is gone, and offers a way back", async () => {
    startServer(aPage([]), "gone");
    await show(<MortgageDetailScreen id="m1" />);
    await screen.findByText(MORTGAGE_MESSAGES.cantFind);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startServer(aPage([]), "fail");
    await show(<MortgageDetailScreen id="m1" />);
    await screen.findByText(MORTGAGE_MESSAGES.couldntLoadOne);
    server.detail = aLoan();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Oak Street");
  });

  it("keeps what it had when a reload fails", async () => {
    const server = startServer(aPage([]));
    await show(<MortgageDetailScreen id="m1" />);
    await screen.findByText("Oak Street");
    server.detail = "fail";
    await act(async () => {
      await store.dispatch(mortgagesApi.endpoints.getMortgageById.initiate("m1", { forceRefetch: true }));
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Oak Street")).toBeTruthy();
  });
});
