import { DOCUMENT_PAGE_SIZE } from "@mybookkeeper/api-client/constants/documentPaging";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { UTILITY_PLAN_READER_MESSAGES as MESSAGES } from "../src/constants/utilityPlanForm";
import DocumentLibrarySheet from "../src/features/documentReader/DocumentLibrarySheet";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { answerDocumentList } from "../test-support/documentPages";

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

/** Answers the library's pages from the documents `respond` gives, as the backend does; every request is kept. */
function answerDocumentsWith(respond: () => Promise<{ id: string; file_name: string }[]>) {
  const requests: string[] = [];
  const adapter: AxiosAdapter = (config) => {
    requests.push(String(config.url));
    return respond().then((documents) => ({
      data: answerDocumentList(config.url, documents.map((document) => ({ ...document, status: "completed" }))),
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }));
  };
  api.defaults.adapter = adapter;
  return requests;
}

async function showSheet(onPick = jest.fn()) {
  await render(
    <Provider store={store}>
      <DocumentLibrarySheet isOpen messages={MESSAGES} onClose={jest.fn()} onPick={onPick} />
    </Provider>,
  );
  return onPick;
}

describe("the document library sheet", () => {
  it("shows a skeleton while the documents load, never 'no documents'", async () => {
    answerDocumentsWith(() => new Promise<never>(() => undefined));
    await showSheet();
    expect(await screen.findByTestId("document-library-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.libraryEmpty)).toBeNull();
  });

  it("says it couldn't load, not 'no documents', and tries again on request", async () => {
    let calls = 0;
    answerDocumentsWith(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("Network Error")) : Promise.resolve([{ id: "d1", file_name: "bill.pdf" }]);
    });
    await showSheet();
    expect(await screen.findByText(MESSAGES.libraryFailed)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.libraryEmpty)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.libraryRetry }));
    expect(await screen.findByText("bill.pdf")).toBeTruthy();
  });

  it("says there are no documents only once it knows there are none", async () => {
    answerDocumentsWith(() => Promise.resolve([]));
    await showSheet();
    expect(await screen.findByText(MESSAGES.libraryEmpty)).toBeTruthy();
  });

  it("hands back the document that was picked", async () => {
    answerDocumentsWith(() => Promise.resolve([{ id: "d1", file_name: "bill.pdf" }]));
    const onPick = await showSheet();
    await fireEvent.press(await screen.findByRole("radio", { name: "bill.pdf" }));
    expect(onPick).toHaveBeenCalledWith("d1", "bill.pdf");
  });

  it("reaches a document past the first page when scrolled to the end", async () => {
    const many = Array.from({ length: DOCUMENT_PAGE_SIZE + 1 }, (_, i) => ({
      id: `d${i}`,
      file_name: `bill-${i}.pdf`,
      created_at: new Date(Date.UTC(2026, 10, 1) - i * 1000).toISOString(),
    }));
    const requests = answerDocumentsWith(() => Promise.resolve(many));
    await showSheet();
    await screen.findByRole("radio", { name: "bill-0.pdf" });
    // The sheet's list is the nearest node above a choice that holds the choices.
    const sheetList = () => {
      let node: ReturnType<typeof screen.getByRole> | null = screen.getByRole("radio", { name: "bill-0.pdf" });
      while (node && !node.props.data) node = node.parent;
      return node!;
    };
    const offered = () => (sheetList().props.data as { value: string }[]).map((option) => option.value);
    expect(offered()).toHaveLength(DOCUMENT_PAGE_SIZE);
    await act(async () => {
      sheetList().props.onEndReached();
    });
    await waitFor(() => expect(offered()).toContain(`d${DOCUMENT_PAGE_SIZE}`));
    expect(requests.at(-1)).toContain(`offset=${DOCUMENT_PAGE_SIZE}`);
  });
});
