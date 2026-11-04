import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import ApplicantDetailScreen from "../src/features/applicants/ApplicantDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anApplicant, startApplicantServer } from "../test-support/applicantsServer";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path), back: () => mockBack() } }));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ApplicantDetailScreen id="a1" />
      </ToastProvider>
    </Provider>,
  );
}

describe("ApplicantDetailScreen", () => {
  it("shows who they are and the stay", async () => {
    startApplicantServer([anApplicant()]);
    await renderScreen();
    expect(await screen.findByText("Dana Reed")).toBeTruthy();
    expect(screen.getByText("Screening Passed")).toBeTruthy();
    expect(screen.getByText("Memorial Hospital")).toBeTruthy();
    expect(screen.getByText("One small dog")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
  });

  it("never shows private details, though the response carries them", async () => {
    startApplicantServer([anApplicant({
      screening_results: [{
        id: "s1", applicant_id: "a1", provider: "keycheck", status: "fail", report_storage_key: "reports/k", adverse_action_snippet: "Eviction on record",
        notes: "Private screening note", requested_at: "2026-11-01T12:00:00Z", completed_at: "2026-11-02T12:00:00Z", uploaded_at: "2026-11-02T12:00:00Z",
        uploaded_by_user_id: "u1", created_at: "2026-11-02T12:00:00Z", presigned_url: "https://files.example.com/signed",
      }],
    })]);
    await renderScreen();
    expect(await screen.findByText("KeyCheck: Didn't pass")).toBeTruthy();
    for (const hidden of [/1990/, /Subaru/, /dana@example\.com/, /555-010/, /secret-key/, /Eviction/, /Private screening note/, /signed/]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });

  it("points to the website for private details", async () => {
    startApplicantServer([anApplicant()]);
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Open on the website" }));
    expect(openURL.mock.calls[0][0]).toMatch(/\/applicants\/a1$/);
  });

  it("says when the website link can't open", async () => {
    startApplicantServer([anApplicant()]);
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no"));
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Open on the website" }));
    expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
  });

  it("links to the inquiry they came from, when there is one", async () => {
    startApplicantServer([anApplicant()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "See the original inquiry" }));
    expect(mockPush).toHaveBeenCalledWith("/inquiries/i1");
  });

  it("has no inquiry link without one", async () => {
    startApplicantServer([anApplicant({ inquiry_id: null })]);
    await renderScreen();
    await screen.findByText("Dana Reed");
    expect(screen.queryByRole("button", { name: "See the original inquiry" })).toBeNull();
  });

  it("shows references, calls and activity, the last folded away", async () => {
    startApplicantServer([anApplicant({
      references: [{ id: "r1", applicant_id: "a1", relationship: "Landlord", reference_name: "Pat Lee", reference_contact: "pat@example.com", notes: null, contacted_at: null, created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" }],
      video_call_notes: [{ id: "v1", applicant_id: "a1", scheduled_at: "2026-11-02T12:00:00Z", completed_at: null, notes: "Friendly", gut_rating: 4, transcript_storage_key: null, created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" }],
      events: [{ id: "e1", applicant_id: "a1", event_type: "approved", actor: "host", notes: null, payload: null, occurred_at: "2026-11-02T12:00:00Z", created_at: "2026-11-02T12:00:00Z" }],
    })]);
    await renderScreen();
    expect(await screen.findByText("Pat Lee")).toBeTruthy();
    expect(screen.queryByText(/pat@example\.com/)).toBeNull();
    expect(screen.getByText("Friendly")).toBeTruthy();
    const activity = screen.getByRole("button", { name: "Activity, Moved to Approved" });
    expect(screen.getByText("No screening yet.")).toBeTruthy();
    await fireEvent.press(activity);
    expect(screen.getAllByText("Moved to Approved").length).toBeGreaterThan(0);
  });

  it("says when they're gone", async () => {
    startApplicantServer([]);
    await renderScreen();
    expect(await screen.findByText("I can't find that applicant.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("says when it can't load, and tries again", async () => {
    const server = startApplicantServer([anApplicant()]);
    server.offline = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load that applicant.")).toBeTruthy();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Dana Reed")).toBeTruthy();
  });
});
