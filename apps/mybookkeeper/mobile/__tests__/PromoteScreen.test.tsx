import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import PromoteScreen from "../src/features/applicants/PromoteScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anInquiry } from "../test-support/inquiriesServer";

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockDispatch = jest.fn();
const mockPreventRemove: { active: boolean; callback: ((event: { repeat: () => void }) => void) | null } = { active: false, callback: null };
jest.mock("expo-router", () => ({
  router: { replace: (path: string) => mockReplace(path), back: () => mockBack() },
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
  },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;

interface Reply {
  status: number;
  data: unknown;
}

function startServer(promoteReply: Reply | "offline", inquiry: unknown = anInquiry()) {
  const posts: AxiosRequestConfig[] = [];
  let reply = promoteReply;
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: "owner" }]);
    if (config.url?.startsWith("/applicants/promote/")) {
      posts.push(config);
      if (reply === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
      return respond(reply.data, reply.status);
    }
    if (config.url === "/inquiries/i1" && inquiry) return respond(inquiry);
    return respond({ detail: "Not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return { posts, setReply: (next: Reply | "offline") => (reply = next) };
}

const created: Reply = { status: 200, data: { id: "a9" } };
const sent = (post: AxiosRequestConfig) => JSON.parse(String(post.data));

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
        <PromoteScreen id="i1" />
      </ToastProvider>
    </Provider>,
  );
}

async function pressPromote() {
  await fireEvent.press(await screen.findByRole("button", { name: "Promote" }));
}

async function chooseBirthDate(date: Date) {
  await fireEvent.press(await screen.findByRole("button", { name: "Choose date of birth" }));
  await act(async () => {
    screen.getByTestId("Date of birth-picker").props.onChange({ type: "set" }, date);
  });
}

describe("PromoteScreen", () => {
  it("fills in what the inquiry knows, and leaves the rest blank", async () => {
    startServer(created, anInquiry({ inquirer_name: "Dana Reed", inquirer_employer: "Memorial", desired_start_date: "2026-12-01" }));
    await renderScreen();
    expect((await screen.findByLabelText("Legal name")).props.value).toBe("Dana Reed");
    expect(screen.getByLabelText("Employer or hospital").props.value).toBe("Memorial");
    expect(screen.getByText("Dec 1, 2026")).toBeTruthy();
    expect(screen.getByText("Not set")).toBeTruthy();
    expect(screen.getByLabelText("Vehicle").props.value).toBe("");
  });

  it("promotes with what was typed, then opens the applicant", async () => {
    const server = startServer(created);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Vehicle"), "  Blue Subaru ");
    await fireEvent.press(screen.getByRole("tab", { name: "No" }));
    await chooseBirthDate(new Date(1990, 1, 3));
    await pressPromote();
    expect(await screen.findByText("Promoted to applicant.")).toBeTruthy();
    expect(sent(server.posts[0])).toMatchObject({ vehicle_make_model: "Blue Subaru", smoker: false, dob: "1990-02-03", pets: null });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/applicants/a9"));
    expect(mockPreventRemove.active).toBe(false);
  });

  it("promotes with nothing added", async () => {
    const server = startServer(created);
    await renderScreen();
    await pressPromote();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/applicants/a9"));
    expect(sent(server.posts[0])).toMatchObject({ dob: null, smoker: null, vehicle_make_model: null });
  });

  it("won't send someone under 18", async () => {
    const server = startServer(created);
    await renderScreen();
    await chooseBirthDate(new Date(new Date().getFullYear() - 10, 0, 1));
    expect(screen.getAllByText("Applicants must be 18 or older.").length).toBeGreaterThan(0);
    await pressPromote();
    expect(server.posts).toHaveLength(0);
  });

  it("takes the date the spinner opened at when Done is pressed", async () => {
    startServer(created);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Choose date of birth" }));
    expect(screen.getByTestId("Date of birth-picker")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done choosing date of birth" }));
    expect(screen.getByRole("button", { name: "Change date of birth" })).toBeTruthy();
  });

  it("explains when the server refuses the age", async () => {
    startServer({ status: 422, data: { detail: "too young" } });
    await renderScreen();
    await pressPromote();
    expect(await screen.findByText("Applicants must be 18 or older.")).toBeTruthy();
  });

  it("starts from the move-in date when that's all the inquiry has", async () => {
    startServer(created, anInquiry({ desired_start_date: null, move_in_date: "2027-02-01" }));
    await renderScreen();
    expect(await screen.findByText("Feb 1, 2027")).toBeTruthy();
  });

  it("lets a date of birth be cleared", async () => {
    startServer(created);
    await renderScreen();
    await chooseBirthDate(new Date(new Date().getFullYear() - 10, 0, 1));
    await fireEvent.press(screen.getByRole("button", { name: "Clear date of birth" }));
    expect(screen.queryByText("Applicants must be 18 or older.")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose date of birth" })).toBeTruthy();
  });

  it("opens the existing applicant when they were already promoted", async () => {
    startServer({ status: 409, data: { detail: { code: "already_promoted", message: "x", applicant_id: "a5" } } });
    await renderScreen();
    await pressPromote();
    expect(await screen.findByText("That one was already promoted. Here it is.")).toBeTruthy();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/applicants/a5"));
  });

  it("stops when the inquiry can't be promoted", async () => {
    startServer({ status: 409, data: { detail: { code: "not_promotable", message: "x", stage: "declined" } } });
    await renderScreen();
    await pressPromote();
    expect(await screen.findByText("I can't promote this one. It's already declined or archived.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Promote" })).toBeDisabled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("keeps everything typed when it fails, and tries again", async () => {
    const server = startServer("offline");
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Vehicle"), "Blue Subaru");
    await pressPromote();
    expect(await screen.findByText("I wasn't able to promote that. Want to try again?")).toBeTruthy();
    expect(screen.getByLabelText("Vehicle").props.value).toBe("Blue Subaru");
    server.setReply(created);
    await pressPromote();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/applicants/a9"));
  });

  it("asks before throwing away what was typed", async () => {
    startServer(created);
    const alert = jest.spyOn(Alert, "alert");
    await renderScreen();
    await screen.findByLabelText("Vehicle");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(screen.getByLabelText("Vehicle"), "Blue Subaru");
    expect(mockPreventRemove.active).toBe(true);
    mockPreventRemove.callback?.({ repeat: () => mockDispatch("leave") });
    expect(alert.mock.calls[0][0]).toBe("Discard this?");
    alert.mock.calls[0][2]?.find((button) => button.text === "Discard")?.onPress?.();
    expect(mockDispatch).toHaveBeenCalledWith("leave");
  });

  it("says when the inquiry is gone", async () => {
    startServer(created, null);
    await renderScreen();
    expect(await screen.findByText("I can't find that inquiry.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });
});
