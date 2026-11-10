import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { LINK_MESSAGES, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { AppState, Linking, Text } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import WorkspaceGate from "../src/features/workspace/WorkspaceGate";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

jest.mock("@platform/mobile", () => ({
  ...jest.requireActual("@platform/mobile"),
  useSession: () => ({ session: { signOut: jest.fn() }, state: { status: "signedIn" } }),
}));

const WORKSPACE = { id: "w1", name: "Mine", org_role: "owner" };
const originalAdapter = api.defaults.adapter;

function respondWith(status: number | "offline", data: unknown = []): AxiosAdapter {
  return (config) => {
    if (status === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    const response = { data, status, statusText: "", headers: {}, config };
    if (status < 400) return Promise.resolve(response);
    return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
  };
}

async function renderGate() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <WorkspaceGate>
          <Text>Inside</Text>
        </WorkspaceGate>
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen(null));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("WorkspaceGate", () => {
  it("opens the first workspace and sends it with later requests", async () => {
    api.defaults.adapter = respondWith(200, [WORKSPACE]);
    await renderGate();
    await waitFor(() => expect(screen.getByText("Inside")).toBeTruthy());

    let sent: unknown;
    api.defaults.adapter = (config) => {
      sent = config.headers["X-Organization-Id"];
      return respondWith(200)(config);
    };
    await api.get("/transactions");
    expect(sent).toBe("w1");
  });

  it("moves off a workspace the person was removed from when the app comes back", async () => {
    const addListener = jest.spyOn(AppState, "addEventListener");
    api.defaults.adapter = respondWith(200, [WORKSPACE, { ...WORKSPACE, id: "w2" }]);
    await renderGate();
    await waitFor(() => expect(store.getState().workspace.activeId).toBe("w1"));

    api.defaults.adapter = respondWith(200, [{ ...WORKSPACE, id: "w2" }]);
    const [, listener] = addListener.mock.calls[addListener.mock.calls.length - 1];
    await act(async () => listener("active"));
    await waitFor(() => expect(store.getState().workspace.activeId).toBe("w2"));
  });

  it("moves off a workspace this account can't see", async () => {
    store.dispatch(workspaceChosen("someone-elses"));
    api.defaults.adapter = respondWith(200, [WORKSPACE]);
    await renderGate();
    await waitFor(() => expect(store.getState().workspace.activeId).toBe("w1"));
  });

  it("says so when there's no workspace", async () => {
    api.defaults.adapter = respondWith(200, []);
    await renderGate();
    expect(await screen.findByRole("header", { name: "No workspace yet" })).toBeTruthy();
    expect(screen.queryByText("Inside")).toBeNull();
    expect(screen.getByText("Sign out")).toBeTruthy();
  });

  it("opens the website from there, and says so when the phone can't", async () => {
    const open = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no browser"));
    api.defaults.adapter = respondWith(200, []);
    await renderGate();
    await fireEvent.press(await screen.findByRole("button", { name: "Open the website" }));
    expect(open).toHaveBeenCalledWith(`${WEB_BASE_URL}/`);
    expect(await screen.findByText(LINK_MESSAGES.couldntOpen)).toBeTruthy();
  });

  it("keeps someone signed in while offline, and recovers", async () => {
    api.defaults.adapter = respondWith("offline");
    await renderGate();
    expect(await screen.findByRole("header", { name: "You're offline" })).toBeTruthy();
    expect(screen.queryByText("Sign out")).toBeNull();

    api.defaults.adapter = respondWith(200, [WORKSPACE]);
    await userEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByText("Inside")).toBeTruthy());
  });

  it("offers sign out when the server is the problem", async () => {
    api.defaults.adapter = respondWith(500);
    await renderGate();
    expect(await screen.findByRole("header", { name: "Couldn't load your workspaces" })).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
  });
});
