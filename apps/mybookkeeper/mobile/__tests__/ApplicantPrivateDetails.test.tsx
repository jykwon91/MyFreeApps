import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { authenticateAsync, getEnrolledLevelAsync, SecurityLevel } from "expo-local-authentication";
import { openBrowserAsync } from "expo-web-browser";
import { AppState, Linking } from "react-native";
import type { AppStateStatus } from "react-native";
import type { ReactNode } from "react";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import ApplicantPrivateDetails from "../src/features/applicants/ApplicantPrivateDetails";
import { useApplicantReveal } from "../src/features/applicants/useApplicantReveal";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anApplicant, noPrivateDetails, startApplicantServer } from "../test-support/applicantsServer";
import type { FakeApplicantServer } from "../test-support/applicantsServer";

const mockFocus: { blur?: () => void } = {};
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockFocus.blur = callback();
      return mockFocus.blur;
    }, [callback]);
  },
}));
jest.mock("expo-local-authentication", () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_STRONG: 3 },
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;
const SHOW = { name: "Show private details" };
const HIDE = { name: "Hide private details" };
const REPORT_URL = "https://files.example/report.pdf?signature=abc";

const withReport = anApplicant({
  references: [
    { id: "r1", applicant_id: "a1", reference_name: "Sam Lee", relationship: "Landlord", contacted_at: null, notes: null, created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" },
  ],
  screening_results: [
    { id: "s1", applicant_id: "a1", provider: "keycheck", status: "fail", has_report: true, requested_at: "2026-11-01T12:00:00Z", completed_at: "2026-11-02T12:00:00Z", uploaded_at: "2026-11-02T12:00:00Z", uploaded_by_user_id: "u1", notes: null, created_at: "2026-11-01T12:00:00Z" },
  ],
});

function everything() {
  return noPrivateDetails({
    dob: "1990-02-03",
    vehicle_make_model: "Blue Civic",
    contact_email: "dana@example.com",
    contact_phone: "+15551234567",
    references: [{ id: "r1", reference_contact: "sam@example.com" }],
    screening_reports: [{ id: "s1", adverse_action_snippet: "Income too low", presigned_url: REPORT_URL, is_available: true }],
  });
}

function expectNothingKept() {
  expect(screen.queryByText("Blue Civic")).toBeNull();
  expect(store.getState()[baseApi.reducerPath].mutations).toEqual({});
}

function reveals(server: FakeApplicantServer): number {
  return server.requests.filter((request) => request.url?.endsWith("/sensitive")).length;
}

async function renderIt(applicant: ApplicantDetailResponse = withReport, canWrite = false) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ApplicantPrivateDetails applicant={applicant} canWrite={canWrite} />
      </ToastProvider>
    </Provider>,
  );
}

async function showDetails() {
  await fireEvent.press(await screen.findByRole("button", SHOW));
  await screen.findByRole("button", HIDE);
}

describe("ApplicantPrivateDetails", () => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;

  beforeEach(() => {
    session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
    jest.clearAllMocks();
    jest.mocked(getEnrolledLevelAsync).mockResolvedValue(SecurityLevel.BIOMETRIC_STRONG);
    jest.mocked(authenticateAsync).mockResolvedValue({ success: true });
    Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
    appStateListener = undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appStateListener = listener as (state: AppStateStatus) => void;
      return { remove: () => { appStateListener = undefined; } } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("asks nothing and fetches nothing until asked", async () => {
    const server = startApplicantServer([withReport]);
    await renderIt();
    await screen.findByRole("button", SHOW);
    expect(authenticateAsync).not.toHaveBeenCalled();
    expect(reveals(server)).toBe(0);
    expect(screen.queryByText("Blue Civic")).toBeNull();
  });

  it("confirms it's them, then shows everything on file", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    await renderIt();
    await showDetails();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(reveals(server)).toBe(1);
    expect(screen.getByText("Blue Civic")).toBeTruthy();
    expect(screen.getByText(/1990/)).toBeTruthy();
    expect(screen.getByText("sam@example.com")).toBeTruthy();
    expect(screen.getByText("Income too low")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Call/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Email/ })).toBeTruthy();
  });

  it("asks again for every reveal", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    await renderIt();
    await showDetails();
    await fireEvent.press(screen.getByRole("button", HIDE));
    expect(screen.queryByText("Blue Civic")).toBeNull();
    await showDetails();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    expect(reveals(server)).toBe(2);
  });

  it.each(["user_cancel", "system_cancel", "app_cancel"])("stays quiet on %s and fetches nothing", async (error) => {
    const server = startApplicantServer([withReport]);
    jest.mocked(authenticateAsync).mockResolvedValue({ success: false, error } as Awaited<ReturnType<typeof authenticateAsync>>);
    await renderIt();
    await fireEvent.press(await screen.findByRole("button", SHOW));
    await waitFor(() => expect(authenticateAsync).toHaveBeenCalled());
    await screen.findByRole("button", SHOW);
    expect(reveals(server)).toBe(0);
    expect(screen.queryByText(/couldn't confirm/)).toBeNull();
  });

  it("says when it can't confirm them, and fetches nothing", async () => {
    const server = startApplicantServer([withReport]);
    jest.mocked(authenticateAsync).mockResolvedValue({ success: false, error: "authentication_failed" } as Awaited<ReturnType<typeof authenticateAsync>>);
    await renderIt();
    await fireEvent.press(await screen.findByRole("button", SHOW));
    expect(await screen.findByText("I couldn't confirm it's you. Want me to try again?")).toBeTruthy();
    expect(reveals(server)).toBe(0);
  });

  it("says when the check itself breaks, and fetches nothing", async () => {
    const server = startApplicantServer([withReport]);
    jest.mocked(getEnrolledLevelAsync).mockRejectedValue(new Error("native"));
    await renderIt();
    await fireEvent.press(await screen.findByRole("button", SHOW));
    expect(await screen.findByText("I couldn't confirm it's you. Want me to try again?")).toBeTruthy();
    expect(reveals(server)).toBe(0);
  });

  it("goes straight through on a phone with no lock", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    jest.mocked(getEnrolledLevelAsync).mockResolvedValue(SecurityLevel.NONE);
    await renderIt();
    await showDetails();
    expect(authenticateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Blue Civic")).toBeTruthy();
  });

  it("explains offline, and can try again", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    server.offline = true;
    await renderIt();
    await fireEvent.press(await screen.findByRole("button", SHOW));
    expect(await screen.findByText(/I don't keep applicant details on your phone/)).toBeTruthy();
    server.offline = false;
    await showDetails();
    expect(screen.queryByText(/I don't keep applicant details/)).toBeNull();
    expect(screen.getByText("Blue Civic")).toBeTruthy();
  });

  it("explains too many reveals", async () => {
    const server = startApplicantServer([withReport]);
    server.revealFailure = 429;
    await renderIt();
    await fireEvent.press(await screen.findByRole("button", SHOW));
    expect(await screen.findByText(/a lot of private details/)).toBeTruthy();
  });

  it("offers to retry any other failure", async () => {
    const server = startApplicantServer([withReport]);
    server.revealFailure = 500;
    await renderIt();
    await fireEvent.press(await screen.findByRole("button", SHOW));
    expect(await screen.findByText("I couldn't load those details. Want me to try again?")).toBeTruthy();
  });

  it("hides again after a minute", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    await renderIt();
    await showDetails();
    await act(async () => { await jest.advanceTimersByTimeAsync(55_000); });
    expect(screen.getByText("Blue Civic")).toBeTruthy();
    await act(async () => { await jest.advanceTimersByTimeAsync(6000); });
    expectNothingKept();
    expect(screen.getByRole("button", SHOW)).toBeTruthy();
    // The store batches its notifications on a timer; a fake one left pending would mute it for later tests.
    await act(async () => { await jest.runOnlyPendingTimersAsync(); });
  });

  it("hides when the app goes to the background", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    await renderIt();
    await showDetails();
    await act(async () => { appStateListener?.("background"); });
    expectNothingKept();
    expect(screen.getByRole("button", SHOW)).toBeTruthy();
  });

  it("hides when they leave the screen", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    await renderIt();
    await showDetails();
    await act(async () => { mockFocus.blur?.(); });
    expectNothingKept();
  });

  it("forgets an answer still on its way when they leave", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    const answer = api.defaults.adapter as AxiosAdapter;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    api.defaults.adapter = async (config) => {
      if (config.url?.endsWith("/sensitive")) await held;
      return answer(config);
    };
    await renderIt();
    await fireEvent.press(await screen.findByRole("button", SHOW));
    await waitFor(() => expect(store.getState()[baseApi.reducerPath].mutations).not.toEqual({}));
    await act(async () => { mockFocus.blur?.(); });
    await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expectNothingKept();
  });

  it("still shows the answer if iOS hasn't quite come back from the prompt", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    jest.mocked(authenticateAsync).mockImplementation(async () => {
      Object.defineProperty(AppState, "currentState", { configurable: true, value: "inactive" });
      return { success: true };
    });
    await renderIt();
    await showDetails();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(screen.getByText("Blue Civic")).toBeTruthy();
  });

  it("asks and fetches once for a double tap", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    const { result } = await renderHook(() => useApplicantReveal("a1"), {
      wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
    });
    await act(async () => {
      await Promise.all([result.current.show(), result.current.show()]);
    });
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(reveals(server)).toBe(1);
  });

  it("doesn't leave a failed prompt waiting for when they come back", async () => {
    startApplicantServer([withReport]);
    await renderIt();
    await screen.findByRole("button", SHOW);
    jest.mocked(authenticateAsync).mockImplementation(async () => {
      mockFocus.blur?.();
      return { success: false, error: "authentication_failed" } as Awaited<ReturnType<typeof authenticateAsync>>;
    });
    await fireEvent.press(screen.getByRole("button", SHOW));
    await waitFor(() => expect(authenticateAsync).toHaveBeenCalled());
    await screen.findByRole("button", SHOW);
    expect(screen.queryByText(/couldn't confirm/)).toBeNull();
  });

  it("still shows details the page behind it doesn't know about yet", async () => {
    const server = startApplicantServer([anApplicant()]);
    server.sensitive = everything();
    await renderIt(anApplicant());
    await showDetails();
    expect(screen.getByText("sam@example.com")).toBeTruthy();
    expect(screen.getByText("Income too low")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open report, Screening report" })).toBeTruthy();
  });

  it("doesn't show an answer that arrives after the app went away", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    await renderIt();
    await screen.findByRole("button", SHOW);
    jest.mocked(authenticateAsync).mockImplementation(async () => {
      Object.defineProperty(AppState, "currentState", { configurable: true, value: "background" });
      return { success: true };
    });
    await fireEvent.press(screen.getByRole("button", SHOW));
    await waitFor(() => expect(reveals(server)).toBe(1));
    await screen.findByRole("button", SHOW);
    expect(screen.queryByText("Blue Civic")).toBeNull();
  });

  it("doesn't fetch if they left during the prompt", async () => {
    const server = startApplicantServer([withReport]);
    await renderIt();
    await screen.findByRole("button", SHOW);
    jest.mocked(authenticateAsync).mockImplementation(async () => {
      mockFocus.blur?.();
      return { success: true };
    });
    await fireEvent.press(screen.getByRole("button", SHOW));
    await waitFor(() => expect(authenticateAsync).toHaveBeenCalled());
    await screen.findByRole("button", SHOW);
    expect(reveals(server)).toBe(0);
  });

  it("opens a report in the in-app browser, not the phone's browser", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    const openURL = jest.spyOn(Linking, "openURL");
    await renderIt();
    await showDetails();
    await fireEvent.press(screen.getByRole("button", { name: /Open report/ }));
    expect(openBrowserAsync).toHaveBeenCalledWith(REPORT_URL);
    expect(openURL).not.toHaveBeenCalled();
  });

  it("says when a report can't open", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = everything();
    jest.mocked(openBrowserAsync).mockRejectedValue(new Error("no"));
    await renderIt();
    await showDetails();
    await fireEvent.press(screen.getByRole("button", { name: /Open report/ }));
    expect(await screen.findByText("I couldn't open that report.")).toBeTruthy();
  });

  it("says when a report file is missing", async () => {
    const server = startApplicantServer([withReport]);
    server.sensitive = noPrivateDetails({
      screening_reports: [{ id: "s1", adverse_action_snippet: null, presigned_url: null, is_available: false }],
    });
    await renderIt();
    await showDetails();
    expect(screen.getByText("That report file is missing.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open report/ })).toBeNull();
  });

  it("says when there's nothing on file", async () => {
    startApplicantServer([withReport]);
    await renderIt();
    await showDetails();
    expect(screen.getByText("Nothing private on file.")).toBeTruthy();
    expect(screen.queryByText("No phone number or email.")).toBeNull();
  });

  it("lets a view-only member see them too", async () => {
    const server = startApplicantServer([withReport]);
    server.role = "viewer";
    server.sensitive = everything();
    await renderIt();
    await showDetails();
    expect(screen.getByText("Blue Civic")).toBeTruthy();
  });

  describe("the email", () => {
    function emailWrites(server: FakeApplicantServer): unknown[] {
      return server.requests
        .filter((request) => request.method === "patch" && request.url?.endsWith("/contact-email"))
        .map((request) => JSON.parse(String(request.data)));
    }

    async function editEmail(text: string) {
      await fireEvent.changeText(screen.getByLabelText("Email"), text);
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    }

    it("adds one when there's none on file", async () => {
      const server = startApplicantServer([withReport]);
      await renderIt(withReport, true);
      await showDetails();
      await fireEvent.press(screen.getByRole("button", { name: "Add email" }));
      await editEmail("  dana@example.com ");
      expect(await screen.findByText("Email saved")).toBeTruthy();
      expect(emailWrites(server)).toEqual([{ contact_email: "dana@example.com" }]);
      expect(screen.getByRole("button", { name: "Change email" })).toBeTruthy();
      expect(screen.queryByLabelText("Email")).toBeNull();
    });

    it("starts from the saved one, and clearing it removes it", async () => {
      const server = startApplicantServer([withReport]);
      server.sensitive = everything();
      await renderIt(withReport, true);
      await showDetails();
      await fireEvent.press(screen.getByRole("button", { name: "Change email" }));
      expect(screen.getByLabelText("Email").props.value).toBe("dana@example.com");
      await editEmail("   ");
      expect(await screen.findByText("Email removed")).toBeTruthy();
      expect(emailWrites(server)).toEqual([{ contact_email: null }]);
      expect(screen.getByRole("button", { name: "Add email" })).toBeTruthy();
    });

    it("says on the field when the address isn't one, and keeps what was typed", async () => {
      const server = startApplicantServer([withReport]);
      server.writeFailure = 422;
      await renderIt(withReport, true);
      await showDetails();
      await fireEvent.press(screen.getByRole("button", { name: "Add email" }));
      await editEmail("not-an-email");
      expect(await screen.findByText("That doesn't look like an email address.")).toBeTruthy();
      expect(screen.getByLabelText("Email").props.value).toBe("not-an-email");
      expect(screen.queryByText("A developer's message")).toBeNull();
    });

    it("says why any other save failed, never the server's own words", async () => {
      const server = startApplicantServer([withReport]);
      server.writeFailure = 403;
      await renderIt(withReport, true);
      await showDetails();
      await fireEvent.press(screen.getByRole("button", { name: "Add email" }));
      await editEmail("dana@example.com");
      expect(await screen.findByText("You have view-only access.")).toBeTruthy();
      server.writeFailure = 500;
      await fireEvent.press(await screen.findByRole("button", { name: "Save" }));
      expect(await screen.findByText("I couldn't save that email. Want to try again?")).toBeTruthy();
      expect(screen.queryByText("A developer's message")).toBeNull();
    });

    it("cancel leaves it as it was", async () => {
      const server = startApplicantServer([withReport]);
      server.sensitive = everything();
      await renderIt(withReport, true);
      await showDetails();
      await fireEvent.press(screen.getByRole("button", { name: "Change email" }));
      await fireEvent.changeText(screen.getByLabelText("Email"), "other@example.com");
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(emailWrites(server)).toEqual([]);
      await fireEvent.press(screen.getByRole("button", { name: "Change email" }));
      expect(screen.getByLabelText("Email").props.value).toBe("dana@example.com");
    });

    it("can't be changed by a view-only member", async () => {
      const server = startApplicantServer([withReport]);
      server.sensitive = everything();
      await renderIt(withReport, false);
      await showDetails();
      expect(screen.queryByRole("button", { name: "Change email" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Add email" })).toBeNull();
    });
  });
});
