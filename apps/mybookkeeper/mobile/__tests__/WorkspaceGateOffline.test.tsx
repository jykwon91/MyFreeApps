import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { SessionContext } from "@platform/mobile/src/auth/SessionContext";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import { render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { Text } from "react-native";
import WorkspaceGate from "../src/features/workspace/WorkspaceGate";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));

const originalAdapter = api.defaults.adapter;
const sent: string[] = [];

/** A phone with no connection: the refresh never arrives, and the server would refuse a request with no token. */
const offline: AxiosAdapter = (config) => {
  sent.push(config.url ?? "");
  if (config.url === "/auth/mobile/refresh") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
  const response = { data: { detail: "Unauthorized" }, status: 401, statusText: "", headers: {}, config };
  return Promise.reject(Object.assign(new Error("401"), { config, response, isAxiosError: true }));
};

beforeEach(() => {
  storedItems.clear();
  storeSession();
  sent.length = 0;
  store.dispatch(baseApi.util.resetApiState());
  api.defaults.adapter = offline;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  store.dispatch(baseApi.util.resetApiState());
});

describe("opening the app with no connection", () => {
  it("says they're offline and still signed in, not that something went wrong", async () => {
    await render(
      <SessionContext.Provider value={session}>
        <Provider store={store}>
          <ToastProvider bottomOffset={0}>
            <WorkspaceGate>
              <Text>Workspace</Text>
            </WorkspaceGate>
          </ToastProvider>
        </Provider>
      </SessionContext.Provider>,
    );

    expect(await screen.findByText("You're offline")).toBeTruthy();
    expect(screen.queryByText("Couldn't load your workspaces")).toBeNull();
    expect(sent).toEqual(["/organizations", "/auth/mobile/refresh"]);
    expect(session.getState().status).toBe("signedIn");
  });
});
