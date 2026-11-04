import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { applicantStageFromParam } from "../src/features/applicants/applicantDisplay";
import ApplicantsScreen from "../src/features/applicants/ApplicantsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anApplicant, startApplicantServer } from "../test-support/applicantsServer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path) } }));

const originalAdapter = api.defaults.adapter;
const onStageChange = jest.fn();
const onSeeInquiries = jest.fn();

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function renderScreen(stage: ApplicantStage | null = null) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ApplicantsScreen onSeeInquiries={onSeeInquiries} onStageChange={onStageChange} stage={stage} />
      </ToastProvider>
    </Provider>,
  );
}

const many = (count: number) => Array.from({ length: count }, (_, index) => anApplicant({ id: `a${index}`, legal_name: `Person ${index}` }));
const reachEnd = async () => {
  await act(async () => {
    screen.getByTestId("applicants-list").props.onEndReached();
  });
};

describe("ApplicantsScreen", () => {
  it("lists applicants and opens the one tapped", async () => {
    startApplicantServer([anApplicant()]);
    await renderScreen();
    expect(await screen.findByText("Dana Reed")).toBeTruthy();
    expect(screen.getByText(/Memorial Hospital ·/)).toBeTruthy();
    expect(screen.getByText("Screening Passed")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Dana Reed, Screening Passed, Memorial Hospital, promoted/ }));
    expect(mockPush).toHaveBeenCalledWith("/applicants/a1");
  });

  it("names someone with no name on file, and leaves out what's missing", async () => {
    startApplicantServer([anApplicant({ legal_name: null, employer_or_hospital: null, contract_start: null, contract_end: null })]);
    await renderScreen();
    expect(await screen.findByText("Unnamed applicant")).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("filters by stage, and drops the stage chip then", async () => {
    const server = startApplicantServer([anApplicant({ stage: "approved" }), anApplicant({ id: "a2", legal_name: "Sam", stage: "lead" })]);
    await renderScreen("approved");
    expect(await screen.findByText("Dana Reed")).toBeTruthy();
    expect(screen.queryByText("Sam")).toBeNull();
    expect(screen.queryByText("Approved")).toBeNull();
    expect(server.requests[0].params).toMatchObject({ stage: "approved", limit: 25, offset: 0 });
  });

  it("asks for a new stage from the sheet", async () => {
    startApplicantServer([anApplicant()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Stage: All" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Declined" }));
    expect(onStageChange).toHaveBeenCalledWith("declined");
  });

  it("ignores a stage it doesn't know in a link", () => {
    expect(applicantStageFromParam("approved")).toBe("approved");
    expect(applicantStageFromParam("nonsense")).toBeNull();
  });

  it("explains how applicants get here when there are none", async () => {
    startApplicantServer([]);
    await renderScreen();
    expect(await screen.findByText("No applicants yet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "See inquiries" }));
    expect(onSeeInquiries).toHaveBeenCalled();
  });

  it("offers to clear a filter that matches nothing", async () => {
    startApplicantServer([anApplicant({ stage: "lead" })]);
    await renderScreen("approved");
    await fireEvent.press(await screen.findByRole("button", { name: "Clear filter" }));
    expect(onStageChange).toHaveBeenCalledWith(null);
  });

  it("loads the next page on reaching the end, without repeating a row", async () => {
    const rows = many(26);
    const server = startApplicantServer(rows);
    await renderScreen();
    await screen.findByText("Person 0");
    server.applicants = [anApplicant({ id: "new", legal_name: "Someone new" }), ...rows];
    await reachEnd();
    await waitFor(() => expect(server.requests.some((request) => (request.params as { offset?: number }).offset === 25)).toBe(true));
    await waitFor(() => {
      const ids = (screen.getByTestId("applicants-list").props.data as { id: string }[]).map((row) => row.id);
      expect(ids).toHaveLength(26);
      expect(new Set(ids).size).toBe(26);
    });
  });

  it("offers another go when the next page fails", async () => {
    const server = startApplicantServer(many(26));
    server.failListFromOffset = 25;
    await renderScreen();
    await screen.findByText("Person 0");
    await reachEnd();
    expect(await screen.findByText("I couldn't load more.")).toBeTruthy();
    server.failListFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("I couldn't load more.")).toBeNull());
  });

  it("says when the list can't load, and tries again", async () => {
    const server = startApplicantServer([anApplicant()]);
    server.offline = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load your applicants.")).toBeTruthy();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Dana Reed")).toBeTruthy();
  });

  it("keeps what it has when a refresh fails", async () => {
    const server = startApplicantServer([anApplicant()]);
    await renderScreen();
    await screen.findByText("Dana Reed");
    server.offline = true;
    await act(async () => {
      await screen.getByTestId("applicants-list").props.refreshControl.props.onRefresh();
    });
    expect(screen.getByText("Dana Reed")).toBeTruthy();
  });
});
