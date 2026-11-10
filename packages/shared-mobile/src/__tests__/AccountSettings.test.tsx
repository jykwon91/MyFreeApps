import { fireEvent, render, screen } from "@testing-library/react-native";
import { SessionContext } from "../auth/SessionContext";
import { fetchDevices } from "../auth/mobileAuthApi";
import AccountSettings from "../components/AccountSettings";
import ToastProvider from "../components/ToastProvider";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

jest.mock("../auth/mobileAuthApi");
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});

const SIGNED_IN: SessionState = { status: "signedIn", email: "me@example.com", sessionId: "mine" };
const session = {
  signOut: jest.fn().mockResolvedValue({ serverReached: true }),
  getState: () => SIGNED_IN,
  subscribe: () => () => {},
} as unknown as MobileSession;

async function renderSettings(onDeleteAccount = jest.fn()) {
  await render(
    <SessionContext.Provider value={session}>
      <ToastProvider bottomOffset={0}>
        <AccountSettings appName="MyRecipes" onDeleteAccount={onDeleteAccount} />
      </ToastProvider>
    </SessionContext.Provider>,
  );
  return onDeleteAccount;
}

describe("AccountSettings", () => {
  beforeEach(() => {
    jest.mocked(fetchDevices).mockResolvedValue([
      { id: "mine", device_name: "My iPhone", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-02T00:00:00Z" },
    ]);
  });

  it("loads this account's devices when it comes into view", async () => {
    await renderSettings();
    expect(await screen.findByText(/My iPhone/)).toBeTruthy();
    expect(screen.getByText(/signed in to your MyRecipes account/)).toBeTruthy();
    expect(fetchDevices).toHaveBeenCalledTimes(1);
  });

  it("shows what signing out reported as a toast", async () => {
    await renderSettings();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out of this phone" }));
    expect(await screen.findByText("You're signed out.")).toBeTruthy();
  });

  it("hands deleting the account to the app", async () => {
    const onDeleteAccount = await renderSettings();
    await fireEvent.press(screen.getByRole("button", { name: "Delete account" }));
    expect(onDeleteAccount).toHaveBeenCalled();
  });
});
