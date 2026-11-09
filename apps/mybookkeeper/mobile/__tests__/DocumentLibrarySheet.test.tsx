import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { UTILITY_PLAN_READER_MESSAGES as MESSAGES } from "../src/constants/utilityPlanForm";
import DocumentLibrarySheet from "../src/features/documentReader/DocumentLibrarySheet";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function answerDocumentsWith(respond: () => Promise<unknown>) {
  const adapter: AxiosAdapter = (config) => respond().then((data) => ({ data, status: 200, statusText: "OK", headers: {}, config }));
  api.defaults.adapter = adapter;
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
});
