import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Provider } from "react-redux";
import { cappedListLabel, cappedSelectNote } from "../src/constants/documents";
import DocumentsScreen from "../src/features/documents/DocumentsScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import type { DocumentFilter } from "../src/types/DocumentFilter";
import { aDocument, startFakeServer } from "../test-support/documentsServer";

jest.mock("@mybookkeeper/api-client/constants/documentListLimit", () => ({ DOCUMENT_LIST_LIMIT: 2 }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;
const A = aDocument({ id: "a", file_name: "alpha.pdf", created_at: "2026-11-03T00:00:00Z" });
const B = aDocument({ id: "b", file_name: "bravo.pdf", created_at: "2026-11-02T00:00:00Z" });
const READING = aDocument({ id: "r", file_name: "reading.pdf", status: "processing", created_at: "2026-11-01T00:00:00Z" });
const GONE = aDocument({ id: "g", file_name: "gone.pdf", status: "deleted", created_at: "2026-10-31T00:00:00Z" });

function Harness() {
  const [filter, setFilter] = useState<DocumentFilter>("all");
  return <DocumentsScreen filter={filter} onFilterChange={setFilter} />;
}

function tree() {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <Harness />
      </ToastProvider>
    </Provider>
  );
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.mocked(useCanWrite).mockReturnValue(true);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("a list cut off at the server's limit", () => {
  it("says it shows the newest ones, and that Select all covers only those", async () => {
    startFakeServer([A, B]);
    await render(tree());
    expect(await screen.findByText(cappedListLabel())).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Select several documents" }));
    expect(screen.getByText(cappedSelectNote())).toBeTruthy();
  });
});

describe("what can be ticked", () => {
  it("leaves out a document being read and one already deleted", async () => {
    startFakeServer([A, READING, GONE]);
    await render(tree());
    await fireEvent.press(await screen.findByRole("button", { name: "Select several documents" }));
    await fireEvent.press(screen.getByRole("button", { name: "Select all the documents shown" }));
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByText("1 document is still being read, so can't be selected yet.")).toBeTruthy();
  });

  it("offers no Select when nothing shown can be ticked", async () => {
    startFakeServer([READING, GONE]);
    await render(tree());
    await screen.findByText("reading.pdf");
    expect(screen.queryByRole("button", { name: "Select several documents" })).toBeNull();
  });
});

describe("losing write access mid-pick", () => {
  it("stops the pick", async () => {
    startFakeServer([A, B]);
    const view = await render(tree());
    await fireEvent.press(await screen.findByRole("button", { name: "Select several documents" }));
    expect(screen.getByText("0 selected")).toBeTruthy();
    jest.mocked(useCanWrite).mockReturnValue(false);
    await view.rerender(tree());
    await waitFor(() => expect(screen.queryByText("0 selected")).toBeNull());
  });
});
