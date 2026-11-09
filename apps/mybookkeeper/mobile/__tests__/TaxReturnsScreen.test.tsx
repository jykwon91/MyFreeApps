import { TAX_RETURN_STATUS_LABELS } from "@mybookkeeper/api-client/constants/taxReturnLabels";
import type { TaxReturn } from "@mybookkeeper/api-client/types/tax/TaxReturn";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../src/constants/taxReturns";
import { byYearNewestFirst, taxReturnTitle } from "../src/features/taxReturns/taxReturnDisplay";
import TaxReturnsScreen from "../src/features/taxReturns/TaxReturnsScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { useIsAdmin } from "../src/features/workspace/useIsAdmin";
import { TAX_RETURN_CREATE_MESSAGES } from "../src/constants/taxReturnCreate";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("../src/features/workspace/useIsAdmin", () => ({ useIsAdmin: jest.fn() }));

const originalAdapter = api.defaults.adapter;

function aReturn(overrides: Partial<TaxReturn> = {}): TaxReturn {
  return {
    id: "r1",
    organization_id: "o1",
    tax_year: 2025,
    filing_status: "single",
    jurisdiction: "federal",
    status: "draft",
    needs_recompute: false,
    filed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

interface Server {
  returns: TaxReturn[];
  dead: boolean;
  never: boolean;
  status?: number;
}

function serve(returns: TaxReturn[] = [aReturn()]): Server {
  const server: Server = { returns, dead: false, never: false };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    if (server.never) return new Promise(() => undefined);
    if (server.dead) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    const answer = { data: server.returns, status: server.status ?? 200, statusText: "", headers: {}, config } as never;
    if (server.status) throw Object.assign(new Error("refused"), { isAxiosError: true, response: answer, config });
    return answer;
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <TaxReturnsScreen />
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockReset();
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.mocked(useIsAdmin).mockReturnValue(false);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("tax return display", () => {
  it("sorts newest year first and says which jurisdiction when it isn't federal", () => {
    const sorted = byYearNewestFirst([aReturn({ id: "old", tax_year: 2023 }), aReturn({ id: "new", tax_year: 2025 })]);
    expect(sorted.map((taxReturn) => taxReturn.id)).toEqual(["new", "old"]);
    expect(taxReturnTitle(aReturn())).toBe("2025 tax return");
    expect(taxReturnTitle(aReturn({ jurisdiction: "CA" }))).toBe("2025 tax return · CA");
  });
});

describe("TaxReturnsScreen", () => {
  it("shows a skeleton while loading, not an empty list", async () => {
    const server = serve();
    server.never = true;
    await show();
    expect(screen.getByTestId("tax-returns-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
  });

  it("lists returns newest first with status, and leaves out the default filing status", async () => {
    serve([aReturn({ id: "a", tax_year: 2023, status: "filed" }), aReturn({ id: "b", tax_year: 2025 })]);
    await show();
    expect(await screen.findByText("2025 tax return")).toBeTruthy();
    expect(screen.getByText(MESSAGES.note)).toBeTruthy();
    expect(screen.queryByText(/single/i)).toBeNull();
    const titles = screen.getAllByText(/\d{4} tax return/).map((node) => node.props.children);
    expect(titles).toEqual(["2025 tax return", "2023 tax return"]);
    expect(screen.getByText(new RegExp(`^${TAX_RETURN_STATUS_LABELS.filed}`))).toBeTruthy();
  });

  it("says when numbers are out of date, and only then", async () => {
    serve([aReturn({ needs_recompute: true }), aReturn({ id: "b", tax_year: 2024 })]);
    await show();
    await screen.findByText("2025 tax return");
    expect(screen.getAllByText(MESSAGES.outOfDate)).toHaveLength(1);
  });

  it("opens a return when its row is pressed", async () => {
    serve();
    await show();
    await fireEvent.press(await screen.findByText("2025 tax return"));
    expect(mockPush).toHaveBeenCalledWith("/tax-returns/r1");
  });

  it("offers an owner or admin a new return, even when there are none yet", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(true);
    serve([]);
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: TAX_RETURN_CREATE_MESSAGES.newReturn }));
    expect(mockPush).toHaveBeenCalledWith("/tax-returns/new");
  });

  it("offers nobody else a new return", async () => {
    serve();
    await show();
    await screen.findByText("2025 tax return");
    expect(screen.queryByText(TAX_RETURN_CREATE_MESSAGES.newReturn)).toBeNull();
  });

  it("offers a writer a way to add a document when there are no returns", async () => {
    serve([]);
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.addDocument));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("gives a viewer no add button", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve([]);
    await show();
    expect(await screen.findByText(MESSAGES.noneBodyViewer)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.addDocument)).toBeNull();
  });

  it("reads a dropped connection as a failure, not as no returns, and can retry", async () => {
    const server = serve();
    server.dead = true;
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.getByText(MESSAGES.checkConnection)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    server.dead = false;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    expect(await screen.findByText("2025 tax return")).toBeTruthy();
  });

  it("doesn't blame the connection when the server answered with an error", async () => {
    const server = serve();
    server.status = 500;
    await show();
    expect(await screen.findByText(MESSAGES.tryAgainLater)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.checkConnection)).toBeNull();
  });

  it("keeps showing what it had, and says so, when a refresh fails", async () => {
    const server = serve();
    await show();
    await screen.findByText("2025 tax return");
    server.dead = true;
    const { refreshControl } = screen.getByTestId("tax-returns-list").props;
    await act(async () => {
      await refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
    expect(screen.getByText("2025 tax return")).toBeTruthy();
  });
});
