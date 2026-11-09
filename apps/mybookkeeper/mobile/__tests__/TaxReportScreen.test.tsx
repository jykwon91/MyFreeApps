import { summaryApi } from "@mybookkeeper/api-client/store/summaryApi";
import type { TaxSummaryResponse } from "@mybookkeeper/api-client/types/summary/TaxSummaryResponse";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { TAX_REPORT_MESSAGES as MESSAGES } from "../src/constants/taxReport";
import { categoryRows, propertyRows, taxYears, toCents } from "../src/features/tax/taxReportDisplay";
import TaxReportScreen from "../src/features/tax/TaxReportScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { useToday } from "../src/lib/useToday";
import { fakeDownloads, fakeFiles, resetFakeFiles } from "../test-support/fakeFileSystem";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("../src/lib/useToday", () => ({ useToday: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const TODAY = new Date(2026, 10, 5);

function aSummary(overrides: Partial<TaxSummaryResponse> = {}): TaxSummaryResponse {
  return {
    year: 2025,
    gross_revenue: 24000,
    total_deductions: 8000.1,
    net_taxable_income: 15999.9,
    by_category: { rental_revenue: 24000, mortgage_interest: 8000.1, mortgage_principal: 3000 },
    by_property: [{ property_id: "p1", name: "Elm St", revenue: 24000, expenses: 8000.1, net_income: 15999.9 }],
    w2_income: [],
    w2_total: 0,
    total_income: 24000,
    ...overrides,
  };
}

interface Server {
  summary: TaxSummaryResponse;
  reads: unknown[];
  dead: boolean;
  never: boolean;
  status?: number;
}

function serve(summary: TaxSummaryResponse = aSummary()): Server {
  const server: Server = { summary, reads: [], dead: false, never: false };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    if (server.never) return new Promise(() => undefined);
    if (server.dead) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    server.reads.push((config.params as { year: number }).year);
    const response = { data: server.summary, status: server.status ?? 200, statusText: "", headers: {}, config } as never;
    if (server.status) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
    return response;
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TaxReportScreen />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockReset();
  resetFakeFiles();
  jest.mocked(Sharing.shareAsync).mockReset();
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.mocked(useToday).mockReturnValue(TODAY);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("taxReportDisplay", () => {
  it("offers this year and the two before it", () => {
    expect(taxYears(TODAY)).toEqual([2026, 2025, 2024]);
  });

  it("notes what isn't in the totals and keeps uncategorized out of the rows", () => {
    const rows = categoryRows(aSummary({ by_category: { mortgage_principal: 10, insurance: 20, uncategorized: 30, security_deposit: 5 } }));
    expect(rows.map((row) => [row.category, row.note])).toEqual([
      ["insurance", null],
      ["mortgage_principal", MESSAGES.notDeductible],
      ["security_deposit", MESSAGES.notCounted],
    ]);
  });

  it("works in cents, where floats would drift", () => {
    expect(categoryRows(aSummary({ by_category: { insurance: 19.99 } }))[0].cents).toBe(1999);
  });

  it("calls a property with no name unassigned", () => {
    const [row] = propertyRows(aSummary({ by_property: [{ property_id: "x", name: null, revenue: 0, expenses: 5, net_income: -5 }] }));
    expect(row.name).toBe("Unassigned");
    expect(row.netCents).toBe(-500);
  });

  it("never gives a negative zero", () => {
    expect(Object.is(toCents(0.3 - (0.1 + 0.2)), 0)).toBe(true);
  });
});

describe("TaxReportScreen", () => {
  it("opens on last year and shows the totals", async () => {
    const server = serve();
    await show();
    expect(await screen.findByText("$15,999.90")).toBeTruthy();
    expect(server.reads).toEqual([2025]);
    expect(screen.getByText(/Revenue \$24,000\.00/)).toBeTruthy();
  });

  it("shows a loss with an explicit minus", async () => {
    serve(aSummary({ net_taxable_income: -1200 }));
    await show();
    expect(await screen.findByText(/-\$1,200\.00/)).toBeTruthy();
  });

  it("says principal isn't deductible", async () => {
    serve();
    await show();
    expect(await screen.findByText(MESSAGES.notDeductible)).toBeTruthy();
    expect(screen.getByText("Mortgage Principal")).toBeTruthy();
  });

  it("keeps wages apart from rental income", async () => {
    serve(aSummary({ w2_total: 50000 }));
    await show();
    expect(await screen.findByText(/W-2 wages \$50,000\.00/)).toBeTruthy();
    expect(screen.getByText("$15,999.90")).toBeTruthy();
  });

  const W2 = {
    employer: "Acme", ein: "12-3456789", wages: 50000, federal_withheld: 6000, social_security_wages: 50000,
    social_security_withheld: 3100, medicare_wages: 50000, medicare_withheld: 725, state_wages: 50000, state_withheld: 1200,
  };

  it("shows total income with wages, and the W-2 employers with what was withheld", async () => {
    serve(aSummary({ w2_income: [W2, { ...W2, employer: null, ein: null, wages: 1000, federal_withheld: 0, state_withheld: 0 }], w2_total: 51000, total_income: 75000 }));
    await show();
    expect(await screen.findByText(new RegExp(MESSAGES.totalIncomeWithWages))).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "W-2" }));
    expect(await screen.findByText("Acme")).toBeTruthy();
    expect(screen.getByText(MESSAGES.ein("12-3456789"))).toBeTruthy();
    expect(screen.getByText(MESSAGES.withheld("$6,000.00", "$1,200.00"))).toBeTruthy();
    expect(screen.getByText(MESSAGES.unknownEmployer)).toBeTruthy();
    expect(screen.queryByText("Mortgage Principal")).toBeNull();
  });

  it("offers no W-2 view for a year without W-2s", async () => {
    serve();
    await show();
    await screen.findByText("Mortgage Principal");
    expect(screen.queryByRole("tab", { name: "W-2" })).toBeNull();
  });

  it("switches to properties", async () => {
    serve();
    await show();
    await screen.findByText("Mortgage Principal");
    await fireEvent.press(screen.getByRole("tab", { name: "Properties" }));
    expect(await screen.findByText("Elm St")).toBeTruthy();
    expect(screen.queryByText("Mortgage Principal")).toBeNull();
  });

  it("changes year from the sheet", async () => {
    const server = serve();
    await show();
    await screen.findByText("$15,999.90");
    await fireEvent.press(screen.getByLabelText(`${MESSAGES.year}, 2025`));
    await fireEvent.press(await screen.findByText("2024"));
    await waitFor(() => expect(server.reads).toEqual([2025, 2024]));
  });

  it("warns about uncategorized money", async () => {
    serve(aSummary({ by_category: { rental_revenue: 24000, uncategorized: 412.5 } }));
    await show();
    expect(await screen.findByText(MESSAGES.uncategorized("$412.50"))).toBeTruthy();
  });

  it("still shows wages in a year with nothing else", async () => {
    serve(aSummary({ by_category: {}, by_property: [], w2_total: 50000 }));
    await show();
    expect(await screen.findByText(/W-2 wages \$50,000\.00/)).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneHeading(2025))).toBeTruthy();
  });

  it("reads a loss as a loss", async () => {
    serve(aSummary({ net_taxable_income: -1200 }));
    await show();
    await screen.findByText(/-\$1,200\.00/);
    expect(screen.getByLabelText(new RegExp(`^${MESSAGES.netIncome}, minus `))).toBeTruthy();
  });

  it("clears the old year's figures while the next one loads", async () => {
    const server = serve();
    await show();
    await screen.findByText("$15,999.90");
    server.never = true;
    await fireEvent.press(screen.getByLabelText(`${MESSAGES.year}, 2025`));
    await fireEvent.press(await screen.findByText("2024"));
    expect(await screen.findByTestId("tax-report-skeleton")).toBeTruthy();
    expect(screen.queryByText("$15,999.90")).toBeNull();
    expect(screen.queryByText(/Share 2025/)).toBeNull();
  });

  it("shows a skeleton while loading, never an empty state", async () => {
    const server = serve();
    server.never = true;
    await show();
    expect(screen.getByTestId("tax-report-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading(2025))).toBeNull();
  });

  it("offers a writer a photo when the year is empty", async () => {
    serve(aSummary({ by_category: {}, by_property: [] }));
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading(2025))).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneBodyWriter)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.takePhoto }));
    expect(mockPush).toHaveBeenCalledWith("/camera");
    expect(screen.queryByText(/Share 2025/)).toBeNull();
  });

  it("gives a viewer no photo button when the year is empty", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve(aSummary({ by_category: {}, by_property: [] }));
    await show();
    expect(await screen.findByText(MESSAGES.noneBodyViewer)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.takePhoto)).toBeNull();
  });

  it("reads a dropped connection as a failure, not as no data", async () => {
    const server = serve();
    server.dead = true;
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad(2025))).toBeTruthy();
    expect(screen.getByText(MESSAGES.checkConnection)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading(2025))).toBeNull();
  });

  it("doesn't blame the connection when the server refused", async () => {
    const server = serve();
    server.status = 429;
    await show();
    expect(await screen.findByText(MESSAGES.tryAgainLater)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.checkConnection)).toBeNull();
  });

  it("recovers from Try again", async () => {
    const server = serve();
    server.dead = true;
    await show();
    await screen.findByText(MESSAGES.couldntLoad(2025));
    server.dead = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByText("$15,999.90")).toBeTruthy();
  });

  it("keeps the last figures with a banner when a refresh fails, and stops sharing", async () => {
    const server = serve();
    await show();
    await screen.findByText("$15,999.90");
    server.dead = true;
    await act(async () => {
      await store.dispatch(summaryApi.util.invalidateTags(["Summary"]));
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("$15,999.90")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share 2025 tax summary PDF" }).props.accessibilityState.disabled).toBe(true);
  });

  it("downloads and shares a PDF, then removes the copy", async () => {
    serve();
    await show();
    await screen.findByText("$15,999.90");
    await fireEvent.press(screen.getByRole("button", { name: "Share 2025 Schedule E PDF" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(fakeDownloads()[0]).toMatch(/\/exports\/schedule-e\/2025$/);
    await waitFor(() => expect(fakeFiles()).toEqual([]));
  });

  it("renews the sign-in before downloading", async () => {
    const server = serve();
    await show();
    await screen.findByText("$15,999.90");
    expect(server.reads).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Share 2025 Schedule E PDF" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(server.reads).toHaveLength(2);
  });

  it("removes the copy when sharing fails", async () => {
    serve();
    jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error("no"));
    await show();
    await screen.findByText("$15,999.90");
    await fireEvent.press(screen.getByRole("button", { name: "Share 2025 tax summary PDF" }));
    expect(await screen.findByText(MESSAGES.couldntExport)).toBeTruthy();
    expect(fakeFiles()).toEqual([]);
  });

  it("finishes a share started before the year changed, and keeps the other year's rows from starting one", async () => {
    serve();
    let finishShare = (): void => undefined;
    jest.mocked(Sharing.shareAsync).mockImplementation(() => new Promise<void>((resolve) => {
      finishShare = resolve;
    }));
    await show();
    await screen.findByText("$15,999.90");
    await fireEvent.press(screen.getByRole("button", { name: "Share 2025 tax summary PDF" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByLabelText(`${MESSAGES.year}, 2025`));
    await fireEvent.press(await screen.findByText("2024"));
    const other = await screen.findByRole("button", { name: "Share 2024 tax summary PDF" });
    expect(other.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText(MESSAGES.preparing)).toBeNull();

    await act(async () => finishShare());
    await waitFor(() => expect(screen.getByRole("button", { name: "Share 2024 tax summary PDF" }).props.accessibilityState.disabled).toBeFalsy());
    expect(fakeFiles()).toEqual([]);
  });

  it("says when the hourly export limit was hit", async () => {
    serve();
    jest.spyOn(File, "downloadFileAsync").mockRejectedValue(new Error("UnableToDownload: response has status 429"));
    await show();
    await screen.findByText("$15,999.90");
    await fireEvent.press(screen.getByRole("button", { name: "Share 2025 tax summary PDF" }));
    expect(await screen.findByText(MESSAGES.tooManyExports)).toBeTruthy();
  });

  it("reports any other export failure", async () => {
    serve();
    jest.spyOn(File, "downloadFileAsync").mockRejectedValue(new Error("no response"));
    await show();
    await screen.findByText("$15,999.90");
    await fireEvent.press(screen.getByRole("button", { name: "Share 2025 tax summary PDF" }));
    expect(await screen.findByText(MESSAGES.couldntExport)).toBeTruthy();
  });
});
