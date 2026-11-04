import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import InquiriesScreen from "../src/features/inquiries/InquiriesScreen";
import { stageFromParam, toPageArgs, viewFromParam } from "../src/features/inquiries/inquiryFilters";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import type { InquiryView } from "../src/types/InquiryView";
import { anInquiry, startInquiryServer } from "../test-support/inquiriesServer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path) } }));

const originalAdapter = api.defaults.adapter;
const onViewChange = jest.fn();
const onStageChange = jest.fn();

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function renderScreen(view: InquiryView = "inbox", stage: InquiryStage | null = null) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <InquiriesScreen onStageChange={onStageChange} onViewChange={onViewChange} stage={stage} view={view} />
      </ToastProvider>
    </Provider>,
  );
}

function manyInquiries(count: number) {
  return Array.from({ length: count }, (_, index) => anInquiry({ id: `i${index}`, inquirer_name: `Person ${index}` }));
}

describe("InquiriesScreen", () => {
  it("lists who asked and opens the one tapped", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /^Dana Reed, new/ }));
    expect(mockPush).toHaveBeenCalledWith("/inquiries/i1");
  });

  it("the inbox shows email inquiries that never got a spam score, and leaves out spam", async () => {
    const server = startInquiryServer([
      anInquiry({ id: "a", inquirer_name: "Unscored Una", spam_status: "unscored" }),
      anInquiry({ id: "b", inquirer_name: "Cleared Cal", spam_status: "manually_cleared" }),
      anInquiry({ id: "c", inquirer_name: "Spam Sam", spam_status: "spam" }),
    ]);
    await renderScreen();
    expect(await screen.findByText("Unscored Una")).toBeTruthy();
    expect(screen.getByText("Cleared Cal")).toBeTruthy();
    expect(screen.queryByText("Spam Sam")).toBeNull();
    expect(server.requests.at(-1)?.params).toMatchObject({ inbox_only: true });
  });

  it("marks spam only on the All view, where it can be mixed in", async () => {
    startInquiryServer([anInquiry({ spam_status: "flagged" })]);
    await renderScreen("all");
    await screen.findByText("Dana Reed");
    expect(screen.getByRole("button", { name: /^Dana Reed, new, flagged/ })).toBeTruthy();
    expect(screen.getAllByText("Flagged")).toHaveLength(2);
  });

  it("changes view", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen();
    await screen.findByText("Dana Reed");
    await fireEvent.press(screen.getByRole("tab", { name: "Spam" }));
    expect(onViewChange).toHaveBeenCalledWith("spam");
  });

  it("filters by stage, and says so when nothing matches", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen("inbox", "replied");
    expect(await screen.findByText("Nothing matches that")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear filter" }));
    expect(onStageChange).toHaveBeenCalledWith(null);
  });

  it("offers a stage choice from the filter", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen();
    await screen.findByText("Dana Reed");
    await fireEvent.press(screen.getByRole("button", { name: "Stage: All" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Replied" }));
    expect(onStageChange).toHaveBeenCalledWith("replied");
  });

  it("says when there's nothing yet", async () => {
    startInquiryServer([]);
    await renderScreen();
    expect(await screen.findByText("No inquiries yet")).toBeTruthy();
  });

  it("offers a retry when the list can't load", async () => {
    const server = startInquiryServer([anInquiry()]);
    server.offline = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load your inquiries.")).toBeTruthy();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Dana Reed")).toBeTruthy();
  });

  it("loads the next page at the end of the list, and retries when that fails", async () => {
    const server = startInquiryServer(manyInquiries(30));
    server.failListFromOffset = 25;
    await renderScreen();
    await screen.findByText("Person 0");
    await act(async () => {
      await screen.getByTestId("inquiries-list").props.onEndReached();
    });
    expect(await screen.findByText("I couldn't load more.")).toBeTruthy();
    server.failListFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(server.requests.filter((request) => request.params?.offset === 25).length).toBeGreaterThan(1));
    expect(screen.queryByText("I couldn't load more.")).toBeNull();
  });

  it("keeps what it has when a refresh fails", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    await screen.findByText("Dana Reed");
    server.offline = true;
    await act(async () => {
      await screen.getByTestId("inquiries-list").props.refreshControl.props.onRefresh();
    });
    expect(screen.getByText("Dana Reed")).toBeTruthy();
  });
});

describe("inquiry filters", () => {
  it("falls back to the inbox and no stage for anything unknown in a link", () => {
    expect(viewFromParam("nonsense")).toBe("inbox");
    expect(viewFromParam("spam")).toBe("spam");
    expect(stageFromParam("nonsense")).toBeNull();
    expect(stageFromParam("replied")).toBe("replied");
  });

  it("asks the server for the right list", () => {
    expect(toPageArgs("inbox", null)).toEqual({ inbox_only: true });
    expect(toPageArgs("flagged", "new")).toEqual({ stage: "new", spam_status: "flagged" });
    expect(toPageArgs("all", null)).toEqual({});
  });
});
