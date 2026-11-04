import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import ApplicantDetailScreen from "../src/features/applicants/ApplicantDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anApplicant, startApplicantServer } from "../test-support/applicantsServer";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: (path: string) => mockPush(path), back: () => mockBack() } }));

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockModal: { onDismiss?: () => void } = {};
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, onDismiss, children }: { visible: boolean; onDismiss?: () => void; children: unknown }) => {
    if (onDismiss) mockModal.onDismiss = onDismiss;
    return visible ? children : null;
  },
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

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

  it("shows a screening result without its private note", async () => {
    startApplicantServer([anApplicant({
      screening_results: [{
        id: "s1", applicant_id: "a1", provider: "keycheck", status: "fail", has_report: true,
        notes: "Private screening note", requested_at: "2026-11-01T12:00:00Z", completed_at: "2026-11-02T12:00:00Z", uploaded_at: "2026-11-02T12:00:00Z",
        uploaded_by_user_id: "u1", created_at: "2026-11-02T12:00:00Z",
      }],
    })]);
    await renderScreen();
    expect(await screen.findByText("KeyCheck: Didn't pass")).toBeTruthy();
    expect(screen.queryByText(/Private screening note/)).toBeNull();
  });

  it("keeps private details hidden until asked", async () => {
    const server = startApplicantServer([anApplicant()]);
    await renderScreen();
    expect(await screen.findByRole("button", { name: "Show private details" })).toBeTruthy();
    expect(server.requests.some((request) => request.url?.endsWith("/sensitive"))).toBe(false);
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
      references: [{ id: "r1", applicant_id: "a1", relationship: "Landlord", reference_name: "Pat Lee", notes: null, contacted_at: null, created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" }],
      video_call_notes: [{ id: "v1", applicant_id: "a1", scheduled_at: "2026-11-02T12:00:00Z", completed_at: null, notes: "Friendly", gut_rating: 4, created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" }],
      events: [{ id: "e1", applicant_id: "a1", event_type: "approved", actor: "host", notes: null, payload: null, occurred_at: "2026-11-02T12:00:00Z", created_at: "2026-11-02T12:00:00Z" }],
    })]);
    await renderScreen();
    expect(await screen.findByText("Pat Lee")).toBeTruthy();
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

  async function chooseStage(label: string) {
    await fireEvent.press(await screen.findByRole("button", { name: "Stage: Screening Passed" }));
    await fireEvent.press(await screen.findByRole("radio", { name: label }));
    await act(async () => {
      mockModal.onDismiss?.();
    });
  }

  describe("moving stage", () => {
    it("moves them with a note, offering only moves that are allowed", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Stage: Screening Passed" }));
      expect(await screen.findByRole("radio", { name: "Approved" })).toBeTruthy();
      expect(screen.queryByRole("radio", { name: "Lead" })).toBeNull();
      await fireEvent.press(screen.getByRole("radio", { name: "Approved" }));
      await act(async () => {
        mockModal.onDismiss?.();
      });
      await fireEvent.changeText(screen.getByLabelText("Note (optional)"), "  References fine  ");
      expect(screen.getByText("19/500")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Move to Approved" }));
      expect(await screen.findByText("Moved to Approved.")).toBeTruthy();
      expect(JSON.parse(String(server.requests.find((request) => request.method === "patch")?.data))).toEqual({ new_stage: "approved", note: "References fine" });
      await waitFor(() => expect(screen.getByRole("button", { name: "Stage: Approved" })).toBeTruthy());
    });

    it("sends no note when it's blank", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await chooseStage("Declined");
      await fireEvent.press(screen.getByRole("button", { name: "Move to Declined" }));
      await screen.findByText("Moved to Declined.");
      expect(JSON.parse(String(server.requests.find((request) => request.method === "patch")?.data)).note).toBeNull();
    });

    it("sends nothing when cancelled, and forgets the note", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await chooseStage("Approved");
      await fireEvent.changeText(screen.getByLabelText("Note (optional)"), "Not sure");
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(server.requests.some((request) => request.method === "patch")).toBe(false);
      await chooseStage("Approved");
      expect(screen.getByLabelText("Note (optional)").props.value).toBe("");
    });

    it("keeps the note when the move fails, and lets them try again", async () => {
      const server = startApplicantServer([anApplicant()]);
      server.writeFailure = 500;
      await renderScreen();
      await chooseStage("Approved");
      await fireEvent.changeText(screen.getByLabelText("Note (optional)"), "Keep me");
      await fireEvent.press(screen.getByRole("button", { name: "Move to Approved" }));
      expect(await screen.findByText("I couldn't move them. Want to try again?")).toBeTruthy();
      expect(screen.queryByText(/developer/)).toBeNull();
      expect(screen.getByLabelText("Note (optional)").props.value).toBe("Keep me");
      server.writeFailure = null;
      await fireEvent.press(screen.getByRole("button", { name: "Move to Approved" }));
      expect(await screen.findByText("Moved to Approved.")).toBeTruthy();
    });

    it("counts the move as made when only the answer was lost", async () => {
      const server = startApplicantServer([anApplicant()]);
      server.loseNextAnswer = true;
      await renderScreen();
      await chooseStage("Approved");
      await fireEvent.press(screen.getByRole("button", { name: "Move to Approved" }));
      expect(await screen.findByText("Moved to Approved.")).toBeTruthy();
    });

    it("explains a move that's no longer allowed", async () => {
      const server = startApplicantServer([anApplicant()]);
      server.writeFailure = 422;
      await renderScreen();
      await chooseStage("Approved");
      await fireEvent.press(screen.getByRole("button", { name: "Move to Approved" }));
      expect(await screen.findByText(/That move isn't available anymore/)).toBeTruthy();
    });

    it("says so when someone else already made that move", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await chooseStage("Approved");
      server.applicants[0].stage = "approved";
      server.writeFailure = 422;
      await fireEvent.press(screen.getByRole("button", { name: "Move to Approved" }));
      expect(await screen.findByText("They're already at Approved.")).toBeTruthy();
      expect(screen.queryByText("Moved to Approved.")).toBeNull();
    });

    it("has no stage button once the lease is signed", async () => {
      startApplicantServer([anApplicant({ stage: "lease_signed" })]);
      await renderScreen();
      expect(await screen.findByText("The start date is locked because the lease is signed.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Stage:/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /contract start/ })).toBeNull();
    });

    it("is read-only for a viewer", async () => {
      const server = startApplicantServer([anApplicant({ stage: "approved" })]);
      server.role = "viewer";
      await renderScreen();
      expect(await screen.findByText("You have view-only access.")).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole("button", { name: /^Stage:/ })).toBeNull());
      expect(screen.queryByRole("button", { name: "Generate lease" })).toBeNull();
      expect(screen.queryByRole("button", { name: /contract start/ })).toBeNull();
    });
  });

  describe("generating a lease", () => {
    it.each(["approved", "lease_sent"] as const)("offers it at %s, on the website", async (stage) => {
      startApplicantServer([anApplicant({ stage })]);
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Generate lease" }));
      expect(openURL.mock.calls[0][0]).toMatch(/\/leases\/new\?applicant_id=a1$/);
    });

    it("says when the website link can't open", async () => {
      startApplicantServer([anApplicant({ stage: "approved" })]);
      jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no"));
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Generate lease" }));
      expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
    });

    it("doesn't offer it before they're approved", async () => {
      startApplicantServer([anApplicant()]);
      await renderScreen();
      await screen.findByRole("button", { name: "Stage: Screening Passed" });
      expect(screen.queryByRole("button", { name: "Generate lease" })).toBeNull();
    });
  });

  describe("contract start", () => {
    const pick = async (year: number, month: number, day: number) => {
      await act(async () => {
        screen.getByTestId("date-picker").props.onChange({ type: "set" }, new Date(year, month, day));
      });
    };

    it("saves the day picked, without moving it across time zones", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Change contract start" }));
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      await pick(2027, 0, 15);
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Contract start saved.")).toBeTruthy();
      expect(JSON.parse(String(server.requests.find((request) => request.method === "patch")?.data))).toEqual({ contract_start: "2027-01-15" });
    });

    it("clears the date", async () => {
      const server = startApplicantServer([anApplicant({ contract_end: null })]);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Change contract start" }));
      await fireEvent.press(screen.getByRole("button", { name: "Clear date" }));
      expect(await screen.findByText("Contract start cleared.")).toBeTruthy();
      expect(JSON.parse(String(server.requests.find((request) => request.method === "patch")?.data))).toEqual({ contract_start: null });
      expect(await screen.findByRole("button", { name: "Add contract start" })).toBeTruthy();
    });

    it("can save today straight away when there's no date yet", async () => {
      const server = startApplicantServer([anApplicant({ contract_start: null })]);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Add contract start" }));
      expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      await screen.findByText("Contract start saved.");
      expect(JSON.parse(String(server.requests.find((request) => request.method === "patch")?.data)).contract_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("says when the lease has locked it", async () => {
      const server = startApplicantServer([anApplicant()]);
      server.writeFailure = 409;
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Change contract start" }));
      await pick(2027, 0, 15);
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("The lease is signed, so this date is locked.")).toBeTruthy();
    });

    it("drops an unsaved pick when cancelled", async () => {
      startApplicantServer([anApplicant()]);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Change contract start" }));
      await pick(2027, 0, 15);
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      await fireEvent.press(await screen.findByRole("button", { name: "Change contract start" }));
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });
});
