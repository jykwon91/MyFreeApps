import { DOCUMENT_PAGE_SIZE } from "@mybookkeeper/api-client/constants/documentPaging";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import DocumentsScreen from "../src/features/documents/DocumentsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aDocument, startFakeServer } from "../test-support/documentsServer";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const TOTAL = DOCUMENT_PAGE_SIZE + 10;
const MANY = Array.from({ length: TOTAL }, (_, i) =>
  aDocument({ id: `m${i}`, file_name: `doc${i}.pdf`, created_at: new Date(Date.UTC(2026, 10, 1) - i * 1000).toISOString() }),
);
const LAST = MANY[TOTAL - 1];

const originalAdapter = api.defaults.adapter;
let alert: jest.SpyInstance;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  alert = jest.spyOn(Alert, "alert");
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  alert.mockRestore();
});

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <DocumentsScreen filter="all" onFilterChange={jest.fn()} />
      </ToastProvider>
    </Provider>,
  );
}

const loaded = () => (screen.getByTestId("documents-list").props.data as { id: string }[]).map((document) => document.id);
const bulkIds = (requests: { url?: string; data?: unknown }[]) =>
  requests
    .filter((request) => request.url === "/documents/bulk-delete")
    .flatMap((request) => (JSON.parse(String(request.data)) as { ids: string[] }).ids);

describe("a list longer than one page", () => {
  it("loads the next page on reaching the end, and counts every document from the start", async () => {
    startFakeServer([...MANY]);
    await renderScreen();
    expect(await screen.findByText(`${TOTAL} documents`)).toBeTruthy();
    expect(loaded()).toHaveLength(DOCUMENT_PAGE_SIZE);
    expect(loaded()).not.toContain(LAST.id);
    await act(async () => {
      await screen.getByTestId("documents-list").props.onEndReached();
    });
    await waitFor(() => expect(loaded()).toContain(LAST.id));
    expect(loaded()).toHaveLength(TOTAL);
  });

  it("selects every document with Select all, loaded or not, and deletes every one", async () => {
    const server = startFakeServer([...MANY]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Select several documents" }));
    await fireEvent.press(screen.getByRole("button", { name: "Select all the documents shown" }));
    expect(await screen.findByText(`${TOTAL} selected`)).toBeTruthy();
    expect(loaded()).not.toContain(LAST.id);
    await fireEvent.press(screen.getByRole("button", { name: `Delete ${TOTAL} selected` }));
    const buttons = alert.mock.calls[alert.mock.calls.length - 1][2];
    await act(async () => {
      buttons?.find((button: { style?: string }) => button.style === "destructive")?.onPress?.();
    });
    await waitFor(() => expect(server.documents).toHaveLength(0));
    expect(bulkIds(server.requests)).toHaveLength(TOTAL);
    expect(bulkIds(server.requests)).toContain(LAST.id);
  });
});
