import { baseApi } from "@platform/core/store/baseApi";
import api from "@platform/core/lib/api";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { TAX_RETURN_CREATE_MESSAGES as MESSAGES } from "../src/constants/taxReturnCreate";
import TaxReturnCreateScreen from "../src/features/taxReturns/TaxReturnCreateScreen";
import { useIsAdmin } from "../src/features/workspace/useIsAdmin";
import { store } from "../src/lib/store";
import { useToday } from "../src/lib/useToday";
import { startTaxServer, type TaxAnswer, writesOnly } from "../test-support/taxReturnsServer";

const mockReplace = jest.fn();
const mockPreventRemove = { active: false };
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { replace: (path: string) => mockReplace(path), back: jest.fn(), canGoBack: () => true },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove.active = active;
  },
}));
jest.mock("../src/features/workspace/useIsAdmin", () => ({ useIsAdmin: jest.fn() }));
jest.mock("../src/lib/useToday", () => ({ useToday: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;

function serve(answer: TaxAnswer | (() => Promise<TaxAnswer>) = { data: { id: "new1" } }) {
  return startTaxServer(() => (typeof answer === "function" ? answer() : answer));
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TaxReturnCreateScreen />
      </ToastProvider>
    </Provider>,
  );
}

const create = () => screen.getByRole("button", { name: MESSAGES.create });

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.clearAllMocks();
  mockPreventRemove.active = false;
  jest.mocked(useIsAdmin).mockReturnValue(true);
  jest.mocked(useToday).mockReturnValue(new Date(2026, 10, 5));
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("TaxReturnCreateScreen", () => {
  it("starts a return for this year as single, says so and opens it", async () => {
    const server = serve();
    await show();
    await fireEvent.press(create());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/tax-returns/new1"));
    expect(writesOnly(server.calls)[0]).toMatchObject({ method: "post", url: "/tax-returns", data: { tax_year: 2026, filing_status: "single" } });
    expect(await screen.findByText(MESSAGES.created(2026))).toBeTruthy();
  });

  it("sends the year and filing status that were chosen", async () => {
    const server = serve();
    await show();
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${MESSAGES.year}`)));
    expect(await screen.findByText("2090")).toBeTruthy();
    await fireEvent.press(await screen.findByText("2095"));
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${MESSAGES.filingStatus}`)));
    await fireEvent.press(await screen.findByText("Head of Household"));
    await fireEvent.press(create());
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(writesOnly(server.calls)[0].data).toEqual({ tax_year: 2095, filing_status: "head_of_household" });
  });

  it("only sends once on a double press", async () => {
    let answer = (): void => undefined;
    const gate = new Promise<void>((resolve) => (answer = resolve));
    const server = serve(async () => {
      await gate;
      return { data: { id: "new1" } };
    });
    await show();
    await fireEvent.press(create());
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.creating }));
    expect(screen.getByText(MESSAGES.creating)).toBeTruthy();
    answer();
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(writesOnly(server.calls)).toHaveLength(1);
  });

  it("says the year already has a return, and keeps the choices", async () => {
    serve({ status: 409 });
    await show();
    await fireEvent.press(create());
    expect(await screen.findByText(MESSAGES.alreadyHave(2026))).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(new RegExp(`^${MESSAGES.year}, 2026`))).toBeTruthy();
  });

  it.each([
    [403, "You have view-only access, so I can't save this."],
    [500, "I'm not sure that saved. Check your tax returns before trying again, so you don't end up with two."],
  ] as const)("shows fixed copy for %s", async (status, copy) => {
    serve({ status });
    await show();
    await fireEvent.press(create());
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("guards leaving only once a choice differs from the defaults", async () => {
    serve();
    await show();
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${MESSAGES.year}`)));
    await fireEvent.press(await screen.findByText("2095"));
    expect(mockPreventRemove.active).toBe(true);
  });

  it("doesn't ask whether to discard after the return was created", async () => {
    serve();
    await show();
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${MESSAGES.year}`)));
    await fireEvent.press(await screen.findByText("2095"));
    await fireEvent.press(create());
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockPreventRemove.active).toBe(false);
  });

  it("tells anyone but an owner or admin they can't start a return", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(false);
    const server = serve();
    await show();
    expect(await screen.findByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.create })).toBeNull();
    expect(server.calls).toHaveLength(0);
  });
});
