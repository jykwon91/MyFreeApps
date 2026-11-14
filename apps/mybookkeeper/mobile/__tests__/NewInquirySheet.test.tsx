import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import InquiriesScreen from "../src/features/inquiries/InquiriesScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anInquiry, lastInquiryWrite, startInquiryServer, type FakeInquiryServer } from "../test-support/inquiriesServer";
import { pressAlertButton } from "../test-support/pressAlertButton";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path) } }));

const originalAdapter = api.defaults.adapter;
const SAVE = { name: "Save inquiry" };
const DEMO_DETAIL = "This feature is not available for demo accounts";

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

async function openSheet(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <InquiriesScreen onStageChange={jest.fn()} onViewChange={jest.fn()} stage={null} view="inbox" />
      </ToastProvider>
    </Provider>,
  );
  await fireEvent.press(await screen.findByRole("button", { name: "Add inquiry" }));
  await screen.findByText("New inquiry");
}

async function typeName(name = "Sam Ortiz"): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText("Inquirer name, required"), name);
}

function posts(server: FakeInquiryServer): number {
  return server.requests.filter((request) => request.url === "/inquiries" && request.method === "post").length;
}

describe("adding an inquiry by hand", () => {
  it("is offered to writers only", async () => {
    const server = startInquiryServer([anInquiry()]);
    server.role = "viewer";
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <InquiriesScreen onStageChange={jest.fn()} onViewChange={jest.fn()} stage={null} view="inbox" />
        </ToastProvider>
      </Provider>,
    );
    await screen.findByText("Dana Reed");
    expect(screen.queryByRole("button", { name: "Add inquiry" })).toBeNull();
  });

  it("opens on a direct inquiry received now, with the website's fields", async () => {
    startInquiryServer([]);
    await openSheet();
    expect(screen.getByRole("radio", { name: "Direct" }).props.accessibilityState.checked).toBe(true);
    expect(screen.queryByLabelText(/inquiry ID/)).toBeNull();
    for (const label of ["Email", "Phone", "Employer / hospital", "Notes"]) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByText("Desired start date")).toBeTruthy();
    expect(screen.getByText("Desired end date")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Date received, / })).toBeTruthy();
    expect(screen.getByText("Time received")).toBeTruthy();
  });

  it("asks for a name before sending anything", async () => {
    const server = startInquiryServer([]);
    await openSheet();
    await fireEvent.press(screen.getByRole("button", SAVE));
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(screen.getByText("A couple of things need a look before I can add this.")).toBeTruthy();
    expect(posts(server)).toBe(0);
  });

  it("asks for the platform's ID when it came from a listing site", async () => {
    const server = startInquiryServer([]);
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "Furnished Finder" }));
    await typeName();
    await fireEvent.press(screen.getByRole("button", SAVE));
    expect(await screen.findByText("Required for non-direct inquiries")).toBeTruthy();
    expect(posts(server)).toBe(0);

    await fireEvent.changeText(screen.getByLabelText("Furnished Finder inquiry ID, required"), " I-12345 ");
    await fireEvent.press(screen.getByRole("button", SAVE));
    await waitFor(() => expect(posts(server)).toBe(1));
    expect(lastInquiryWrite(server)?.body).toMatchObject({ source: "FF", external_inquiry_id: "I-12345", inquirer_name: "Sam Ortiz" });
  });

  it("saves, says so, and opens the new inquiry", async () => {
    const server = startInquiryServer([]);
    server.listings = [{ id: "l1", title: "Garage Suite A" }];
    await openSheet();
    await typeName(" Sam Ortiz ");
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.changeText(screen.getByLabelText("Phone"), "(555) 010-9999");
    await fireEvent.changeText(screen.getByLabelText("Employer / hospital"), "Memorial");
    await fireEvent.changeText(screen.getByLabelText("Notes"), "Called about March");
    await fireEvent.press(await screen.findByRole("radio", { name: "Garage Suite A" }));
    await fireEvent.press(screen.getByRole("button", SAVE));

    expect(await screen.findByText("Got it. I added Sam Ortiz's inquiry.")).toBeTruthy();
    const write = lastInquiryWrite(server);
    expect(write).toMatchObject({ method: "post", url: "/inquiries" });
    expect(write?.body).toMatchObject({
      source: "direct",
      external_inquiry_id: null,
      listing_id: "l1",
      inquirer_name: "Sam Ortiz",
      inquirer_email: "sam@example.com",
      inquirer_phone: "(555) 010-9999",
      inquirer_employer: "Memorial",
      desired_start_date: null,
      desired_end_date: null,
      notes: "Called about March",
    });
    expect((write?.body as { received_at: string }).received_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    expect(mockPush).toHaveBeenCalledWith("/inquiries/new0");
    expect(screen.queryByText("New inquiry")).toBeNull();
  });

  it("still adds one when listings can't load, and says linking can wait", async () => {
    const server = startInquiryServer([]);
    server.listings = null;
    await openSheet();
    expect(await screen.findByText("I couldn't load your listings. You can still add the inquiry and link one later.")).toBeTruthy();
    await typeName();
    await fireEvent.press(screen.getByRole("button", SAVE));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/inquiries/new0"));
  });

  it("shows the busy state and sends once when tapped twice", async () => {
    const server = startInquiryServer([]);
    const answer = api.defaults.adapter as AxiosAdapter;
    let sent = 0;
    api.defaults.adapter = (config) => {
      if (config.method === "post") {
        sent += 1;
        return new Promise(() => undefined);
      }
      return answer(config);
    };
    await openSheet();
    await typeName();
    const onPress = screen.getByRole("button", SAVE).props.onClick ?? screen.getByRole("button", SAVE).props.onPress;
    await act(async () => {
      onPress?.({});
      onPress?.({});
    });
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saving…" }).props.accessibilityState).toMatchObject({ busy: true });
    expect(sent).toBe(1);
    expect(posts(server)).toBe(0);
  });

  describe("when it fails, says why on the form and keeps what was typed", () => {
    async function failWith(createOutcome: FakeInquiryServer["createOutcome"], offline = false): Promise<FakeInquiryServer> {
      const server = startInquiryServer([]);
      await openSheet();
      await typeName();
      server.createOutcome = createOutcome;
      server.offline = offline;
      await fireEvent.press(screen.getByRole("button", SAVE));
      return server;
    }

    afterEach(() => {
      expect(screen.getByText("New inquiry")).toBeTruthy();
      expect(screen.getByLabelText("Inquirer name, required").props.value).toBe("Sam Ortiz");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows the server's reason for a validation error", async () => {
      await failWith({ status: 422, detail: [{ msg: "Value error, desired_start_date cannot be after desired_end_date", loc: ["body"] }] });
      expect(await screen.findByText("desired_start_date cannot be after desired_end_date")).toBeTruthy();
    });

    it("shows the server's reason for another refusal", async () => {
      await failWith({ status: 409, detail: "An inquiry with that ID already exists" });
      expect(await screen.findByText("An inquiry with that ID already exists")).toBeTruthy();
    });

    it("says demo workspaces can't add inquiries", async () => {
      await failWith({ status: 403, detail: DEMO_DETAIL });
      expect(await screen.findByText("Demo workspaces can't add inquiries.")).toBeTruthy();
    });

    it("says view-only access can't add inquiries", async () => {
      await failWith({ status: 403, detail: "Viewers have read-only access" });
      expect(await screen.findByText("You have view-only access, so I can't add inquiries.")).toBeTruthy();
    });

    it("warns it may have been added when no answer came back, since a direct inquiry has no duplicate check", async () => {
      await failWith(null, true);
      expect(await screen.findByText(/I'm not sure that was added/)).toBeTruthy();
      expect(screen.getByText(/Check your inquiries before trying again/)).toBeTruthy();
    });

    it("warns it may have been added on a server error", async () => {
      await failWith({ status: 500 });
      expect(await screen.findByText(/I'm not sure that was added/)).toBeTruthy();
      expect(screen.getByRole("button", SAVE)).toBeTruthy();
    });

    it("refetches the list behind the sheet after an unsure failure", async () => {
      const server = startInquiryServer([]);
      await openSheet();
      await typeName();
      const listReads = () => server.requests.filter((request) => request.url === "/inquiries" && request.method === "get").length;
      await screen.findByText("No inquiries yet");
      const before = listReads();

      server.createOutcome = { status: 500 };
      await fireEvent.press(screen.getByRole("button", SAVE));
      await screen.findByText(/I'm not sure that was added/);
      await waitFor(() => expect(listReads()).toBeGreaterThan(before));
    });
  });

  it("stops each field at the length the server accepts", async () => {
    startInquiryServer([]);
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "Furnished Finder" }));
    expect(screen.getByLabelText("Furnished Finder inquiry ID, required").props.maxLength).toBe(100);
    expect(screen.getByLabelText("Inquirer name, required").props.maxLength).toBe(255);
    expect(screen.getByLabelText("Email").props.maxLength).toBe(255);
    expect(screen.getByLabelText("Phone").props.maxLength).toBe(50);
    expect(screen.getByLabelText("Employer / hospital").props.maxLength).toBe(255);
    expect(screen.getByLabelText("Notes").props.maxLength).toBe(5000);
  });

  it("announces the source choices as disabled while saving", async () => {
    startInquiryServer([]);
    api.defaults.adapter = ((answer) => (config) => (config.method === "post" ? new Promise(() => undefined) : answer(config)))(api.defaults.adapter as AxiosAdapter);
    await openSheet();
    await typeName();
    await fireEvent.press(screen.getByRole("button", SAVE));
    await screen.findByRole("button", { name: "Saving…" });
    expect(screen.getByRole("radio", { name: "Direct" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("asks before throwing away what was typed", async () => {
    startInquiryServer([]);
    const alertSpy = jest.spyOn(Alert, "alert");
    await openSheet();
    await typeName();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("New inquiry")).toBeTruthy();
    await pressAlertButton(alertSpy, "Discard");
    expect(screen.queryByText("New inquiry")).toBeNull();
  });

  it("closes straight away when nothing was typed", async () => {
    startInquiryServer([]);
    const alertSpy = jest.spyOn(Alert, "alert");
    await openSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("New inquiry")).toBeNull();
  });
});
