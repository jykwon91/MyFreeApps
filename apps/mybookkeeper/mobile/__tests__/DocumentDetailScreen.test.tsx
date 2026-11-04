import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import DocumentDetailScreen from "../src/features/documents/DocumentDetailScreen";
import { clearDocumentFiles } from "../src/features/documents/openDocumentFile";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aDocument, startFakeServer } from "../test-support/documentsServer";

const mockBack = jest.fn();
const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockShare = jest.fn();
const mockDirectoryDelete = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));
jest.mock("expo-file-system", () => {
  class Directory {
    exists = true;
    create() {}
    delete() {
      mockDirectoryDelete();
    }
  }
  class File {
    uri: string;
    exists = true;
    static downloadFileAsync = (...args: unknown[]) => mockDownload(...args);
    constructor(_directory: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    delete() {
      mockDelete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: "cache" } };
});
jest.mock("expo-sharing", () => ({ shareAsync: (...args: unknown[]) => mockShare(...args) }));

const originalAdapter = api.defaults.adapter;

async function renderDetail() {
  await render(
    <Provider store={store}>
      <DocumentDetailScreen id="d1" />
    </Provider>,
  );
  await screen.findByRole("header");
  // The actions wait on knowing the workspace's role.
  await act(async () => {
    await store.dispatch(baseApi.util.getRunningQueriesThunk());
  });
}

beforeEach(() => {
  session.tokenStore.set("the-token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  mockDownload.mockResolvedValue({});
  mockShare.mockResolvedValue(undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("DocumentDetailScreen", () => {
  it("shows a photo with the sign-in in the headers, not the address", async () => {
    startFakeServer([aDocument({ file_mime_type: "image/jpeg" })]);
    await renderDetail();
    const source = screen.getByLabelText(/^Photo of/).props.source;
    expect(source.uri).toMatch(/\/documents\/d1\/download$/);
    expect(source.uri).not.toContain("the-token");
    expect(source.headers).toEqual({ Authorization: "Bearer the-token", "X-Organization-Id": "w1" });
  });

  it("renews the sign-in and tries a photo again before giving up", async () => {
    const server = startFakeServer([aDocument({ file_mime_type: "image/jpeg" })]);
    await renderDetail();
    const before = server.requests.length;
    session.tokenStore.set("newer-token");
    await act(async () => {
      screen.getByLabelText(/^Photo of/).props.onError();
    });
    await waitFor(() => expect(server.requests.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByLabelText(/^Photo of/).props.source.headers.Authorization).toBe("Bearer newer-token"));
    await act(async () => {
      screen.getByLabelText(/^Photo of/).props.onError();
    });
    expect(await screen.findByText("Open on the website")).toBeTruthy();
  });

  it("removes every leftover copy when asked", async () => {
    clearDocumentFiles();
    expect(mockDirectoryDelete).toHaveBeenCalled();
  });

  it("opens a PDF, then removes the downloaded copy", async () => {
    startFakeServer([aDocument({ file_name: "../../evil.pdf" })]);
    await renderDetail();
    await fireEvent.press(screen.getByRole("button", { name: "Open PDF" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("file:///cache/d1.pdf"));
    const [url, , options] = mockDownload.mock.calls[0];
    expect(url).not.toContain("the-token");
    expect(options.headers).toEqual({ Authorization: "Bearer the-token", "X-Organization-Id": "w1" });
    expect(mockShare.mock.calls[0][0]).toBe("file:///cache/d1.pdf");
  });

  it("says so when a PDF won't open, and still removes the copy", async () => {
    mockShare.mockRejectedValue(new Error("no viewer"));
    startFakeServer([aDocument()]);
    await renderDetail();
    await fireEvent.press(screen.getByRole("button", { name: "Open PDF" }));
    expect(await screen.findByText("I couldn't open that file. Want to try again?")).toBeTruthy();
    expect(mockDelete).toHaveBeenCalled();
  });

  it("explains an email with no saved file", async () => {
    startFakeServer([aDocument({ source: "email", file_mime_type: null })]);
    await renderDetail();
    expect(screen.getByText(/The original email isn't saved/)).toBeTruthy();
  });

  it("deletes only after confirming, then goes back", async () => {
    const server = startFakeServer([aDocument()]);
    const alert = jest.spyOn(Alert, "alert");
    await renderDetail();
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    expect(server.requests.some((request) => request.method === "delete")).toBe(false);
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe("Delete lumber.pdf?");
    await act(async () => {
      buttons?.find((button) => button.style === "destructive")?.onPress?.();
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(server.requests.some((request) => request.method === "delete")).toBe(true);
    alert.mockRestore();
  });

  it("tries a failed document again and shows why it failed", async () => {
    const server = startFakeServer([aDocument({ status: "failed", error_message: "Blurry" })]);
    await renderDetail();
    expect(screen.getByText("I had trouble reading this one.")).toBeTruthy();
    expect(screen.getByText("Blurry")).toBeTruthy();
    await fireEvent.press(await screen.findByRole("button", { name: "Try reading it again" }));
    await waitFor(() => expect(server.requests.some((request) => request.method === "post")).toBe(true));
  });

  it("offers a viewer no changes", async () => {
    startFakeServer([aDocument({ status: "failed" })], "viewer");
    await renderDetail();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try reading it again" })).toBeNull();
  });

  it("says when a document is gone", async () => {
    startFakeServer([]);
    await render(
      <Provider store={store}>
        <DocumentDetailScreen id="d1" />
      </Provider>,
    );
    expect(await screen.findByText("I can't find that document.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });
});
