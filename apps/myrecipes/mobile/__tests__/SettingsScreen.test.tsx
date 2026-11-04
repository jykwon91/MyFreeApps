import { type MobileSession, type SessionState, SessionProvider } from "@platform/mobile";
import api from "@platform/core/lib/api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import SettingsScreen from "../src/features/settings/SettingsScreen";
import "../src/lib/store";

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

const originalAdapter = api.defaults.adapter;

function fakeSession(state: SessionState, overrides: Partial<MobileSession> = {}): MobileSession {
  return {
    start: async () => {},
    getState: () => state,
    subscribe: () => () => {},
    ...overrides,
  } as MobileSession;
}

async function renderWith(session: MobileSession) {
  await render(
    <SessionProvider session={session}>
      <SettingsScreen />
    </SessionProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("SettingsScreen", () => {
  it("shows a skeleton, not a sign-in prompt, while it reads the stored session", async () => {
    await renderWith(fakeSession({ status: "restoring" }));
    expect(screen.queryByText("You're not signed in")).toBeNull();
    expect(screen.getByTestId("account-skeleton", { includeHiddenElements: true })).toBeTruthy();
  });

  it("offers sign-in when signed out", async () => {
    await renderWith(fakeSession({ status: "signedOut", endedByServer: false, lastEmail: null }));
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(mockPush).toHaveBeenCalledWith("/sign-in");
  });

  it("doesn't call a locked phone signed out, and has ways forward", async () => {
    const retryRestore = jest.fn().mockResolvedValue(undefined);
    const skipRestore = jest.fn();
    await renderWith(fakeSession({ status: "unreadable" }, { retryRestore, skipRestore }));

    expect(screen.getByText(/You haven't been signed out/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(retryRestore).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Sign in with your password" }));
    expect(skipRestore).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/sign-in");
  });

  it("lists this account's devices when signed in", async () => {
    const adapter: AxiosAdapter = async (config) => ({
      status: 200,
      statusText: "",
      headers: {},
      config,
      data: [{ id: "s1", device_name: "My iPhone", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-11-01T00:00:00Z" }],
    });
    api.defaults.adapter = adapter;
    await renderWith(fakeSession({ status: "signedIn", email: "me@example.com", sessionId: "s1" }));

    await waitFor(() => expect(screen.getByText("My iPhone")).toBeTruthy());
    expect(screen.getByText("This device")).toBeTruthy();
    expect(screen.getByText("Signed in as me@example.com")).toBeTruthy();
  });

  it("shows what signing out reported", async () => {
    api.defaults.adapter = async (config) => ({ status: 200, statusText: "", headers: {}, config, data: [] });
    const signOut = jest.fn().mockResolvedValue({ serverReached: true });
    await renderWith(fakeSession({ status: "signedIn", email: "me@example.com", sessionId: "s1" }, { signOut }));
    await fireEvent.press(screen.getByRole("button", { name: "Sign out of this phone" }));
    await waitFor(() => expect(screen.getByText("You're signed out.")).toBeTruthy());
  });
});
