import { ToastProvider } from "@platform/mobile";
import { SessionContext } from "@platform/mobile/src/auth/SessionContext";
import type { MobileSession } from "@platform/mobile/src/types/MobileSession";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import WorkspaceMessage from "../src/features/workspace/WorkspaceMessage";

const SIGNED_IN = { status: "signedIn" };

async function renderMessage(serverReached: boolean) {
  const signOut = jest.fn().mockResolvedValue({ serverReached });
  const session = { signOut, getState: () => SIGNED_IN, subscribe: () => () => {} } as unknown as MobileSession;
  await render(
    <SessionContext.Provider value={session}>
      <ToastProvider bottomOffset={0}>
        <WorkspaceMessage action={{ label: "Try again", onPress: jest.fn() }} body="Something went wrong." heading="Couldn't load your workspaces" />
      </ToastProvider>
    </SessionContext.Provider>,
  );
  return signOut;
}

describe("WorkspaceMessage sign out", () => {
  it("warns when the server wasn't told about the sign out", async () => {
    const signOut = await renderMessage(false);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByText(/may still appear in your device list/)).toBeTruthy());
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("confirms a normal sign out without the warning", async () => {
    await renderMessage(true);
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByText("You're signed out.")).toBeTruthy());
    expect(screen.queryByText(/may still appear/)).toBeNull();
  });
});
