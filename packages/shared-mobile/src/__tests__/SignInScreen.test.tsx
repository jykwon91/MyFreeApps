import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { resendVerificationEmail } from "../auth/mobileAuthApi";
import { SessionContext } from "../auth/SessionContext";
import SignInScreen from "../components/SignInScreen";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";
import type { SignInResult } from "../types/SignInResult";

jest.mock("../auth/mobileAuthApi", () => ({
  ...jest.requireActual("../auth/mobileAuthApi"),
  resendVerificationEmail: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));

const SIGNED_OUT: SessionState = { status: "signedOut", endedByServer: false, lastEmail: "kept@example.com" };
const SIGNED_IN: SessionState = { status: "signedIn", email: "me@example.com", sessionId: "s" };

function fakeSession(signIn: jest.Mock<Promise<SignInResult>>, initial: SessionState): MobileSession {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    signIn: async (credentials: unknown) => {
      const result = await signIn(credentials);
      if (result.outcome === "signedIn") {
        state = SIGNED_IN;
        listeners.forEach((listener) => listener());
      }
      return result;
    },
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as MobileSession;
}

async function renderScreen(
  signIn: jest.Mock<Promise<SignInResult>>,
  onSignedIn = jest.fn(),
  initial: SessionState = SIGNED_OUT,
) {
  await render(
    <SessionContext.Provider value={fakeSession(signIn, initial)}>
      <SignInScreen appName="MyRecipes" onSignedIn={onSignedIn} webBaseUrl="https://web.test" />
    </SessionContext.Provider>,
  );
  return onSignedIn;
}

async function fillAndSubmit(password = "secret") {
  await fireEvent.changeText(screen.getByLabelText("Email"), "  me@example.com ");
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

const failed = (failure: string) => ({ outcome: "failed", failure }) as SignInResult;
const resend = jest.mocked(resendVerificationEmail);
const RESEND = { name: "Resend verification email" };

beforeEach(() => resend.mockReset());

describe("SignInScreen", () => {
  it("fills in the email it last knew", async () => {
    await renderScreen(jest.fn());
    expect(screen.getByLabelText("Email").props.value).toBe("kept@example.com");
  });

  it("explains an empty form rather than sending it", async () => {
    const signIn = jest.fn();
    await renderScreen(signIn);
    await fireEvent.changeText(screen.getByLabelText("Email"), "");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in with a trimmed email and an untouched password", async () => {
    const signIn = jest.fn().mockResolvedValue({ outcome: "signedIn" });
    const onSignedIn = await renderScreen(signIn);
    await fillAndSubmit(" spaced ");
    expect(signIn).toHaveBeenCalledWith({ email: "me@example.com", password: " spaced ", totpCode: undefined });
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it("closes straight away when reached already signed in", async () => {
    const onSignedIn = jest.fn();
    await renderScreen(jest.fn(), onSignedIn, SIGNED_IN);
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it("shows and hides the password", async () => {
    await renderScreen(jest.fn());
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  });

  it.each([
    ["bad_credentials", "That email or password isn't right. Check them and try again."],
    ["rate_limited", "Too many attempts. Wait a few minutes, then try again."],
    ["unreachable", "Can't reach MyRecipes. Check your connection and try again."],
    ["not_verified", "Verify your email before signing in."],
    ["storage", "Your phone couldn't save your sign-in, so you're not signed in. Try again."],
    ["unexpected", "Something went wrong. Please try again."],
  ])("explains %s", async (failure, message) => {
    await renderScreen(jest.fn().mockResolvedValue(failed(failure)));
    await fillAndSubmit();
    expect(screen.getByText(message, { exact: false })).toBeTruthy();
    expect(screen.getByLabelText("Password").props.value).toBe("secret");
  });

  describe("resending the verification email", () => {
    it.each(["bad_credentials", "rate_limited", "unreachable", "unexpected"])("isn't offered for %s", async (failure) => {
      await renderScreen(jest.fn().mockResolvedValue(failed(failure)));
      await fillAndSubmit();
      expect(screen.queryByRole("button", RESEND)).toBeNull();
    });

    it("sends it to the address that couldn't sign in, then says so", async () => {
      let answer: (outcome: "sent") => void = () => {};
      resend.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      await renderScreen(jest.fn().mockResolvedValue(failed("not_verified")));
      await fillAndSubmit();
      await fireEvent.changeText(screen.getByLabelText("Email"), "typo@example.com");
      await fireEvent.press(screen.getByRole("button", RESEND));

      expect(resend).toHaveBeenCalledWith("me@example.com");
      const busy = screen.getByRole("button", { name: /Sending/ });
      expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });

      await act(async () => answer("sent"));
      expect(screen.getByText("Verification email sent. Check your inbox.")).toBeTruthy();
      expect(screen.queryByRole("button", RESEND)).toBeNull();
    });

    it.each([
      ["rate_limited", "Too many requests. Wait a few minutes, then try again."],
      ["failed", "Couldn't resend right now. Try again shortly."],
    ] as const)("explains %s and lets them try again", async (outcome, message) => {
      resend.mockResolvedValueOnce(outcome).mockResolvedValueOnce("sent");
      await renderScreen(jest.fn().mockResolvedValue(failed("not_verified")));
      await fillAndSubmit();
      await fireEvent.press(screen.getByRole("button", RESEND));
      expect(await screen.findByText(message)).toBeTruthy();

      await fireEvent.press(screen.getByRole("button", RESEND));
      expect(await screen.findByText("Verification email sent. Check your inbox.")).toBeTruthy();
      expect(screen.queryByText(message)).toBeNull();
    });
  });

  it("opens the website for what the app doesn't do", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderScreen(jest.fn());
    await fireEvent.press(screen.getByRole("link", { name: /Forgot your password/ }));
    await fireEvent.press(screen.getByRole("link", { name: /Create an account/ }));
    expect(open.mock.calls).toEqual([["https://web.test/forgot-password"], ["https://web.test/register"]]);
  });

  it("says so when the phone can't open the website", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no browser"));
    await renderScreen(jest.fn());
    await fireEvent.press(screen.getByRole("link", { name: /Forgot your password/ }));
    expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
  });

  describe("second factor", () => {
    async function reachCodeStep(signIn: jest.Mock<Promise<SignInResult>>) {
      signIn.mockResolvedValueOnce({ outcome: "totpRequired" });
      const onSignedIn = await renderScreen(signIn);
      await fillAndSubmit();
      return onSignedIn;
    }

    it("sends the code with the same email and password", async () => {
      const signIn = jest.fn();
      const onSignedIn = await reachCodeStep(signIn);
      signIn.mockResolvedValueOnce({ outcome: "signedIn" });

      await fireEvent.changeText(screen.getByLabelText("Authentication code"), "123 456");
      await fireEvent.press(screen.getByRole("button", { name: "Verify" }));

      expect(signIn).toHaveBeenLastCalledWith({ email: "me@example.com", password: "secret", totpCode: "123456" });
      expect(onSignedIn).toHaveBeenCalledTimes(1);
    });

    it("never sends a code on its own", async () => {
      const signIn = jest.fn();
      await reachCodeStep(signIn);
      await fireEvent.changeText(screen.getByLabelText("Authentication code"), "123456");
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("clears a wrong code and explains it", async () => {
      const signIn = jest.fn();
      await reachCodeStep(signIn);
      signIn.mockResolvedValueOnce(failed("invalid_totp"));
      await fireEvent.changeText(screen.getByLabelText("Authentication code"), "123456");
      await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
      expect(screen.getByText(/Each code works once/)).toBeTruthy();
      expect(screen.getByLabelText("Authentication code").props.value).toBe("");
    });

    it("takes a recovery code", async () => {
      const signIn = jest.fn();
      await reachCodeStep(signIn);
      signIn.mockResolvedValueOnce({ outcome: "signedIn" });
      await fireEvent.press(screen.getByRole("button", { name: "Use a recovery code instead" }));
      await fireEvent.changeText(screen.getByLabelText("Recovery code"), "ab12-cd34");
      await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
      expect(signIn).toHaveBeenLastCalledWith(expect.objectContaining({ totpCode: "AB12CD34" }));
    });

    it("keeps the rate-limit message on the code step", async () => {
      const signIn = jest.fn();
      await reachCodeStep(signIn);
      signIn.mockResolvedValueOnce(failed("rate_limited"));
      await fireEvent.changeText(screen.getByLabelText("Authentication code"), "123456");
      await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
      expect(screen.getByText(/Too many attempts/)).toBeTruthy();
      expect(screen.getByLabelText("Authentication code")).toBeTruthy();
    });

    it("goes back to the password if it stopped working", async () => {
      const signIn = jest.fn();
      await reachCodeStep(signIn);
      signIn.mockResolvedValueOnce(failed("bad_credentials"));
      await fireEvent.changeText(screen.getByLabelText("Authentication code"), "123456");
      await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
      expect(screen.getByText(/isn't right/)).toBeTruthy();
      expect(screen.getByLabelText("Email").props.value.trim()).toBe("me@example.com");
    });

    it("goes back keeping what was typed", async () => {
      const signIn = jest.fn();
      await reachCodeStep(signIn);
      await act(async () => {
        await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      });
      expect(screen.getByLabelText("Password").props.value).toBe("secret");
    });
  });
});
