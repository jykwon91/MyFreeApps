import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import TransactionEditScreen from "../src/features/transactions/TransactionEditScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aSavedVendor, aTransaction, lastPatch, startTransactionServer } from "../test-support/transactionsServer";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), canGoBack: () => true },
  usePreventRemove: jest.fn(),
}));

jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;
const FIRST_PAGE = 25;
const VENDOR_COUNT = FIRST_PAGE + 5;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function manyVendors() {
  return Array.from({ length: VENDOR_COUNT }, (_, i) => aSavedVendor({ id: `v${i + 1}`, name: `Vendor ${i + 1}` }));
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TransactionEditScreen id="t1" />
      </ToastProvider>
    </Provider>,
  );
}

/** The sheet's list: the nearest ancestor of its first option that holds the options. */
function sheetList(): ReturnType<typeof screen.getByRole> {
  let node: ReturnType<typeof screen.getByRole> | null = screen.getByRole("radio", { name: "Vendor 5" });
  while (node && !node.props.data) node = node.parent;
  return node!;
}

const offered = () => (sheetList().props.data as { value: string }[]).map((option) => option.value);

describe("the saved vendor picker on the transaction editor", () => {
  it("reaches a vendor past the first page on reaching the end of the sheet", async () => {
    const server = startTransactionServer([aTransaction()]);
    server.vendors = manyVendors();
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText("Saved vendor, None"));
    await screen.findByRole("radio", { name: "Vendor 5" });
    expect(screen.queryByRole("radio", { name: "Vendor 30" })).toBeNull();

    await act(async () => {
      sheetList().props.onEndReached();
    });
    await waitFor(() => expect(offered()).toContain("v30"));
    // The list draws only the rows near the top, so the page 2 row is picked through its own press handler.
    const options = sheetList().props.data as { value: string; label: string }[];
    const row = options.findIndex((option) => option.value === "v30");
    await act(async () => {
      sheetList().props.renderItem({ item: options[row], index: row }).props.onPress();
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastPatch(server)).toEqual({ vendor_id: "v30" });
    const offsets = server.requests.filter((request) => request.url === "/vendors").map((request) => request.params.offset);
    expect(offsets).toEqual([0, FIRST_PAGE]);
  });

  it("names a linked vendor that isn't on the first page, by reading it on its own", async () => {
    const server = startTransactionServer([aTransaction({ vendor_id: "v30" })]);
    server.vendors = manyVendors();
    await renderScreen();

    expect(await screen.findByLabelText("Saved vendor, Vendor 30")).toBeTruthy();
    expect(server.requests.filter((request) => request.url === "/vendors/v30")).toHaveLength(1);
  });

  it("reads no extra vendor when the linked one is on the first page", async () => {
    const server = startTransactionServer([aTransaction({ vendor_id: "v3" })]);
    server.vendors = manyVendors();
    await renderScreen();

    expect(await screen.findByLabelText("Saved vendor, Vendor 3")).toBeTruthy();
    expect(server.requests.some((request) => request.url === "/vendors/v3")).toBe(false);
  });
});
