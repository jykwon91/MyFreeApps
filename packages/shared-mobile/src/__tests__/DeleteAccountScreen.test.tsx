import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { fetchDevices, fetchTwoFactorEnabled, requestDeleteAccount } from "../auth/mobileAuthApi";
import { SessionContext } from "../auth/SessionContext";
import DeleteAccountScreen from "../components/DeleteAccountScreen";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

jest.mock("../auth/mobileAuthApi");

const SIGNED_IN: SessionState = { status: "signedIn", email: "me@example.com", sessionId: "mine" };
const twoFactorEnabled = jest.mocked(fetchTwoFactorEnabled);
const deleteAccount = jest.mocked(requestDeleteAccount);
const devices = jest.mocked(fetchDevices);
const DELETE = { name: "Delete my account forever" };

async function open({ twoFactor = false } = {}) {
  twoFactorEnabled.mockResolvedValue(twoFactor);
  const session = {
    accountDeleted: jest.fn(),
    getState: () => SIGNED_IN,
    subscribe: () => () => {},
  } as unknown as MobileSession;
  await render(
    <SessionContext.Provider value={session}>
      <DeleteAccountScreen warning="This deletes your recipes." />
    </SessionContext.Provider>,
  );
  await waitFor(() => expect(screen.queryByTestId("two-factor-skeleton")).toBeNull());
  return session;
}

async function fillIn(email = "me@example.com", password = "pw") {
  await fireEvent.changeText(screen.getByLabelText("Type your email to confirm"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
}

function isDisabled() {
  return screen.getByRole("button", DELETE).props.accessibilityState?.disabled === true;
}

async function press() {
  await fireEvent.press(screen.getByRole("button", DELETE));
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("says what goes, and waits for the email, password and code", async () => {
  await open({ twoFactor: true });
  expect(screen.getByText("This deletes your recipes.")).toBeTruthy();
  expect(isDisabled()).toBe(true);

  await fillIn("someone-else@example.com");
  expect(isDisabled()).toBe(true);

  await fillIn(" ME@example.com ");
  expect(isDisabled()).toBe(true);

  await fireEvent.changeText(screen.getByLabelText("Authentication code"), "123 456");
  expect(isDisabled()).toBe(false);
});

it("doesn't ask for a code when two-factor is off, and sends none", async () => {
  await open();
  deleteAccount.mockResolvedValue({ outcome: "deleted" });
  expect(screen.queryByLabelText("Authentication code")).toBeNull();

  await fillIn();
  await press();

  expect(deleteAccount).toHaveBeenCalledWith({ email: "me@example.com", password: "pw", code: null });
});

it("ends the session once the account is gone", async () => {
  const session = await open();
  deleteAccount.mockResolvedValue({ outcome: "deleted" });

  await fillIn();
  await press();

  expect(session.accountDeleted).toHaveBeenCalledWith("confirmed");
});

it("clears a wrong password and keeps the email", async () => {
  await open();
  deleteAccount.mockResolvedValue({ outcome: "wrong_password" });

  await fillIn();
  await press();

  expect(screen.getByLabelText("Password").props.value).toBe("");
  expect(screen.getByLabelText("Type your email to confirm").props.value).toBe("me@example.com");
  expect(screen.getAllByText("That password isn't right.").length).toBeGreaterThan(0);
});

it("clears a wrong code", async () => {
  await open({ twoFactor: true });
  deleteAccount.mockResolvedValue({ outcome: "invalid_code" });

  await fillIn();
  await fireEvent.changeText(screen.getByLabelText("Authentication code"), "123456");
  await press();

  expect(screen.getByLabelText("Authentication code").props.value).toBe("");
  expect(screen.getByText("That code didn't work. Enter a new one.")).toBeTruthy();
});

it("asks for a code if the server says one is needed after all", async () => {
  await open();
  deleteAccount.mockResolvedValue({ outcome: "code_required" });

  await fillIn();
  await press();

  expect(screen.getByLabelText("Authentication code")).toBeTruthy();
  expect(isDisabled()).toBe(true);
});

it("shows why it was refused, says nothing was deleted, and asks for a new code", async () => {
  const session = await open({ twoFactor: true });
  deleteAccount.mockResolvedValue({ outcome: "refused", message: "Remove them from it, then try again." });

  await fillIn();
  await fireEvent.changeText(screen.getByLabelText("Authentication code"), "123456");
  await press();

  expect(screen.getByText("Your account wasn't deleted. Remove them from it, then try again.")).toBeTruthy();
  expect(screen.getByLabelText("Authentication code").props.value).toBe("");
  expect(session.accountDeleted).not.toHaveBeenCalled();
});

it("won't send it again when the answer was lost, and checks instead", async () => {
  const session = await open();
  deleteAccount.mockResolvedValue({ outcome: "unknown" });

  await fillIn();
  await press();

  expect(screen.queryByRole("button", DELETE)).toBeNull();
  expect(screen.getByText(/couldn't confirm whether your account was deleted/)).toBeTruthy();
  expect(session.accountDeleted).not.toHaveBeenCalled();

  devices.mockRejectedValueOnce(new Error("offline"));
  await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
  expect(screen.getByText(/couldn't confirm/)).toBeTruthy();

  devices.mockResolvedValueOnce([]);
  await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
  expect(screen.getByText("Your account wasn't deleted. You can try again.")).toBeTruthy();
  expect(screen.getByRole("button", DELETE)).toBeTruthy();
  expect(deleteAccount).toHaveBeenCalledTimes(1);
});

it("clears this phone if the session stops working while checking, without claiming it's deleted", async () => {
  let state: SessionState = SIGNED_IN;
  const accountDeleted = jest.fn();
  twoFactorEnabled.mockResolvedValue(false);
  const session = { accountDeleted, getState: () => state, subscribe: () => () => {} } as unknown as MobileSession;
  await render(
    <SessionContext.Provider value={session}>
      <DeleteAccountScreen warning="w" />
    </SessionContext.Provider>,
  );
  await waitFor(() => expect(screen.queryByTestId("two-factor-skeleton")).toBeNull());
  deleteAccount.mockResolvedValue({ outcome: "unknown" });
  await fillIn();
  await press();
  expect(accountDeleted).not.toHaveBeenCalled();

  devices.mockImplementationOnce(async () => {
    state = { status: "signedOut", endedByServer: true, lastEmail: "me@example.com" };
    throw new Error("401");
  });
  await fireEvent.press(screen.getByRole("button", { name: "Check again" }));

  expect(accountDeleted).toHaveBeenCalledWith("unconfirmed");
});

it("won't guess whether two-factor is on", async () => {
  twoFactorEnabled.mockRejectedValueOnce(new Error("offline"));
  twoFactorEnabled.mockResolvedValue(false);
  const session = { getState: () => SIGNED_IN, subscribe: () => () => {} } as unknown as MobileSession;
  await render(
    <SessionContext.Provider value={session}>
      <DeleteAccountScreen warning="w" />
    </SessionContext.Provider>,
  );
  await waitFor(() => expect(screen.getByText(/couldn't check your account's security/)).toBeTruthy());

  await fillIn();
  expect(isDisabled()).toBe(true);

  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(isDisabled()).toBe(false));
  expect(screen.queryByText(/couldn't check your account's security/)).toBeNull();
});
