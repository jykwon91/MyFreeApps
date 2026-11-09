import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { useState } from "react";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { MAX_BULK_DELETE_DOCUMENT_IDS } from "@mybookkeeper/api-client/constants/documentBulkDelete";
import { beingReadMessage, deletedMessage, deletedSomeFailedMessage, hiddenSelectedNote } from "../src/constants/documentBulk";
import type { DocumentFilter } from "../src/types/DocumentFilter";
import DocumentsScreen from "../src/features/documents/DocumentsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aDocument, startFakeServer } from "../test-support/documentsServer";
import { holdWrites } from "../test-support/holdWrites";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path) },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;
const A = aDocument({ id: "a", file_name: "alpha.pdf", created_at: "2026-11-03T00:00:00Z" });
const B = aDocument({ id: "b", file_name: "bravo.pdf", created_at: "2026-11-02T00:00:00Z" });
const C = aDocument({ id: "c", file_name: "charlie.pdf", created_at: "2026-11-01T00:00:00Z" });

function Harness() {
  const [filter, setFilter] = useState<DocumentFilter>("all");
  return <DocumentsScreen filter={filter} onFilterChange={setFilter} />;
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <Harness />
      </ToastProvider>
    </Provider>,
  );
}

let alert: jest.SpyInstance;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, "alert");
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  alert.mockRestore();
});

const bulkRequests = (requests: { url?: string; data?: unknown }[]) => requests.filter((request) => request.url === "/documents/bulk-delete");

/** Presses the Delete button in the confirmation the screen raised. */
async function confirmDeletion() {
  const buttons = alert.mock.calls[alert.mock.calls.length - 1][2];
  await act(async () => {
    buttons?.find((button: { style?: string }) => button.style === "destructive")?.onPress?.();
  });
}

async function startPicking(label: RegExp = /alpha/) {
  await fireEvent(await screen.findByLabelText(label), "longPress");
}

describe("picking several documents", () => {
  it("starts from a long press, ticks that one, and shows the count in the header", async () => {
    startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /alpha/ }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole("checkbox", { name: /bravo/ }).props.accessibilityState).toMatchObject({ checked: false });
  });

  it("starts from the Select button, and taps tick rows instead of opening them", async () => {
    startFakeServer([A, B]);
    await renderScreen();
    await screen.findByText("alpha.pdf");
    await fireEvent.press(screen.getByRole("button", { name: "Select several documents" }));
    expect(screen.getByText("0 selected")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: /alpha/ }));
    await fireEvent.press(screen.getByRole("checkbox", { name: /bravo/ }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: /bravo/ }));
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("stops picking on Cancel and opens documents again", async () => {
    startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("button", { name: "Stop selecting" }));
    expect(screen.queryByText("1 selected")).toBeNull();
    await fireEvent.press(screen.getByLabelText(/alpha/));
    expect(mockPush).toHaveBeenCalledWith("/documents/a");
  });

  it("selects every document shown with Select all, and not the ones still being read", async () => {
    startFakeServer([A, B, aDocument({ id: "p", file_name: "papers.pdf", status: "processing" })]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("button", { name: "Select all the documents shown" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(screen.getByText("1 document is still being read, so can't be selected yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select all the documents shown" }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByLabelText(/papers/));
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("selects only what the search and filters leave shown", async () => {
    startFakeServer([A, B, C]);
    await renderScreen();
    await screen.findByText("alpha.pdf");
    await fireEvent.changeText(screen.getByLabelText("Search documents"), "r");
    await fireEvent.press(screen.getByRole("button", { name: "Select several documents" }));
    await fireEvent.press(screen.getByRole("button", { name: "Select all the documents shown" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("counts and deletes only what is on screen, and says how many a search hides", async () => {
    const server = startFakeServer([A, B, C]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("button", { name: "Select all the documents shown" }));
    expect(screen.getByText("3 selected")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Search documents"), "bravo");
    await waitFor(() => expect(screen.getByText("1 selected")).toBeTruthy());
    expect(screen.getByText(hiddenSelectedNote(2))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    expect(alert.mock.calls[alert.mock.calls.length - 1][0]).toBe("Delete 1 document?");
    await confirmDeletion();
    await waitFor(() => expect(server.documents.map((document) => document.id)).toEqual(["a", "c"]));
  });

  it("drops ticks for documents gone after a refresh", async () => {
    const server = startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("checkbox", { name: /bravo/ }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    server.documents = [A];
    await act(async () => {
      await screen.getByTestId("documents-list").props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(screen.getByText("1 selected")).toBeTruthy());
  });

  it("offers a viewer none of it", async () => {
    startFakeServer([A, B], "viewer");
    await renderScreen();
    await screen.findByText("alpha.pdf");
    await fireEvent(screen.getByLabelText(/alpha/), "longPress");
    expect(screen.queryByText("1 selected")).toBeNull();
    expect(screen.queryByRole("button", { name: "Select several documents" })).toBeNull();
  });
});

describe("deleting the selected documents", () => {
  it("asks first, with the honest count and what happens to their transactions", async () => {
    const server = startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("checkbox", { name: /bravo/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 2 selected" }));
    const [title, body] = alert.mock.calls[0];
    expect(title).toBe("Delete 2 documents?");
    expect(body).toBe("They'll be removed from your documents. The transactions I pulled from them stay in your books. This can't be undone.");
    expect(bulkRequests(server.requests)).toHaveLength(0);
  });

  it("uses the singular for one", async () => {
    startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    expect(alert.mock.calls[0][0]).toBe("Delete 1 document?");
  });

  it("does nothing when the question is cancelled", async () => {
    const server = startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    const buttons = alert.mock.calls[0][2];
    await act(async () => {
      buttons?.find((button: { style?: string }) => button.style === "cancel")?.onPress?.();
    });
    expect(bulkRequests(server.requests)).toHaveLength(0);
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("deletes them in one request with the website's endpoint, says how many, and refreshes the list", async () => {
    const server = startFakeServer([A, B, C]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("checkbox", { name: /bravo/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 2 selected" }));
    await confirmDeletion();
    expect(await screen.findByText("Deleted 2 documents")).toBeTruthy();
    expect(bulkRequests(server.requests)).toHaveLength(1);
    expect(JSON.parse(String(bulkRequests(server.requests)[0].data))).toEqual({ ids: ["a", "b"] });
    await waitFor(() => expect(screen.queryByText("alpha.pdf")).toBeNull());
    expect(screen.queryByText("bravo.pdf")).toBeNull();
    expect(screen.getByText("charlie.pdf")).toBeTruthy();
    expect(screen.queryByText(/selected$/)).toBeNull();
    expect(screen.getByText("1 document")).toBeTruthy();
  });

  it("says one was deleted in the singular", async () => {
    startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await confirmDeletion();
    expect(await screen.findByText("Deleted 1 document")).toBeTruthy();
  });

  it("says some were already gone when the server only counts, and ends the pick", async () => {
    const server = startFakeServer([A, B, C]);
    server.bulkDeleteSkips = ["b"];
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("checkbox", { name: /bravo/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 2 selected" }));
    await confirmDeletion();
    expect(await screen.findByText("Deleted 1. 1 was already gone.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("alpha.pdf")).toBeNull());
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("keeps the ones the server refused as being read selected, to try again", async () => {
    const server = startFakeServer([A, B, C]);
    server.bulkDeleteBeingRead = ["b"];
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("checkbox", { name: /bravo/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 2 selected" }));
    await confirmDeletion();
    expect(await screen.findByText(beingReadMessage(1, 1))).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("alpha.pdf")).toBeNull());
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /bravo/ }).props.accessibilityState).toMatchObject({ checked: true });
    server.bulkDeleteBeingRead = [];
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await confirmDeletion();
    expect(await screen.findByText("Deleted 1 document")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("bravo.pdf")).toBeNull());
  });

  it("sends more than the server's cap in batches", async () => {
    const many = Array.from({ length: MAX_BULK_DELETE_DOCUMENT_IDS + 1 }, (_, i) =>
      aDocument({ id: `m${i}`, file_name: `doc${i}.pdf`, created_at: new Date(Date.UTC(2026, 10, 1) - i * 1000).toISOString() }),
    );
    const server = startFakeServer(many);
    await renderScreen();
    await startPicking(/doc0\.pdf/);
    await fireEvent.press(screen.getByRole("button", { name: "Select all the documents shown" }));
    await fireEvent.press(screen.getByRole("button", { name: `Delete ${many.length} selected` }));
    await confirmDeletion();
    await waitFor(() => expect(server.documents).toHaveLength(0));
    expect(bulkRequests(server.requests).map((request) => (JSON.parse(String(request.data)) as { ids: string[] }).ids.length)).toEqual([500, 1]);
    expect(await screen.findByText(deletedMessage(many.length))).toBeTruthy();
  });

  it("says exactly what went when a later batch fails, and keeps the failed ones selected to retry", async () => {
    const many = Array.from({ length: MAX_BULK_DELETE_DOCUMENT_IDS + 1 }, (_, i) =>
      aDocument({ id: `m${i}`, file_name: `doc${i}.pdf`, created_at: new Date(Date.UTC(2026, 10, 1) - i * 1000).toISOString() }),
    );
    const server = startFakeServer(many);
    server.failBulkDeleteFrom = 2;
    await renderScreen();
    await startPicking(/doc0\.pdf/);
    await fireEvent.press(screen.getByRole("button", { name: "Select all the documents shown" }));
    await fireEvent.press(screen.getByRole("button", { name: `Delete ${many.length} selected` }));
    await confirmDeletion();
    expect(await screen.findByText(deletedSomeFailedMessage(MAX_BULK_DELETE_DOCUMENT_IDS, 1))).toBeTruthy();
    await waitFor(() => expect(server.documents).toHaveLength(1));
    await waitFor(() => expect(screen.getByText("1 selected")).toBeTruthy());
    server.failBulkDeleteFrom = null;
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await confirmDeletion();
    await waitFor(() => expect(server.documents).toHaveLength(0));
  });

  it("keeps the selection and says so when the whole request fails", async () => {
    const server = startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    server.failWritesWith = 500;
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await confirmDeletion();
    expect(await screen.findByText("I couldn't delete those. Want to try again?")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByText("alpha.pdf")).toBeTruthy();
    server.failWritesWith = null;
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await confirmDeletion();
    expect(await screen.findByText("Deleted 1 document")).toBeTruthy();
  });

  it("says when it can't reach the server", async () => {
    const server = startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    server.offline = true;
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await confirmDeletion();
    expect(await screen.findByText("I can't reach the server, so I couldn't delete those. They're still selected.")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("says when the role is read-only", async () => {
    const server = startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    server.failWritesWith = 403;
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await confirmDeletion();
    expect(await screen.findByText("You have read-only access, so I can't delete these.")).toBeTruthy();
  });

  it("shows loading on Delete while it is on its way, locks the header, and sends once", async () => {
    startFakeServer([A, B]);
    await renderScreen();
    await startPicking();
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    holdWrites();
    const held = api.defaults.adapter as AxiosAdapter;
    const writes: string[] = [];
    api.defaults.adapter = (config) => {
      if (config.method === "post") writes.push(String(config.url));
      return held(config);
    };
    await confirmDeletion();
    expect(await screen.findByText("Deleting…")).toBeTruthy();
    await fireEvent.press(screen.getByText("Deleting…"));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(["/documents/bulk-delete"]);
    expect(screen.getByRole("button", { name: "Stop selecting" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("can't delete with nothing selected", async () => {
    const server = startFakeServer([A, B]);
    await renderScreen();
    await screen.findByText("alpha.pdf");
    await fireEvent.press(screen.getByRole("button", { name: "Select several documents" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 0 selected" }));
    expect(alert).not.toHaveBeenCalled();
    expect(bulkRequests(server.requests)).toHaveLength(0);
  });
});
