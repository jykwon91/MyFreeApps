import { render, screen, userEvent } from "@testing-library/react-native";
import { SessionContext } from "../auth/SessionContext";
import RequiredSignInScreen from "../components/RequiredSignInScreen";
import SessionPendingScreen from "../components/SessionPendingScreen";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));

function renderWith(ui: React.ReactElement, state: SessionState, overrides: Partial<MobileSession> = {}) {
  const session = { getState: () => state, subscribe: () => () => {}, ...overrides } as unknown as MobileSession;
  return render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>);
}

const ENDED = "You've been signed out on this device. Sign in again to continue.";

describe("RequiredSignInScreen", () => {
  it("says why when the server ended the session", async () => {
    await renderWith(<RequiredSignInScreen appName="App" webBaseUrl="https://x" />, {
      status: "signedOut",
      endedByServer: true,
      lastEmail: "a@example.com",
    });
    expect(screen.getByText(ENDED)).toBeTruthy();
  });

  it("has nothing extra for someone who signed out themselves", async () => {
    await renderWith(<RequiredSignInScreen appName="App" webBaseUrl="https://x" />, {
      status: "signedOut",
      endedByServer: false,
      lastEmail: null,
    });
    expect(screen.queryByText(ENDED)).toBeNull();
  });
});

describe("SessionPendingScreen", () => {
  it("shows nothing while it's still reading", async () => {
    await renderWith(<SessionPendingScreen />, { status: "restoring" });
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("offers a way on from a locked phone without signing out", async () => {
    const skipRestore = jest.fn();
    await renderWith(<SessionPendingScreen />, { status: "unreadable" }, { skipRestore });
    expect(screen.getByText("You haven't been signed out.", { exact: false })).toBeTruthy();
    await userEvent.press(screen.getByText("Sign in with your password"));
    expect(skipRestore).toHaveBeenCalledTimes(1);
  });
});
