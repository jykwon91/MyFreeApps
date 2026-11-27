import api from "@platform/core/lib/api";
import { _resetPlatformForTests, configurePlatform } from "@platform/core/platform/configurePlatform";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import RegisterScreen from "../components/RegisterScreen";
import { AUTH_FORM_COPY, REGISTER_COPY } from "../constants/authForms";
import { TURNSTILE_COPY } from "../constants/turnstile";
import type { RegisterNameField } from "../types/RegisterNameField";
import { serve } from "../../test-support/fakeServer";
import { fieldLabel } from "../../test-support/fieldLabelPattern";
import { webViewMounts } from "../../test-support/mockWebView";
import { SHOWN } from "../../test-support/shown";
import { FAKE_SITE_KEY, passChallenge } from "../../test-support/turnstile";
import type { FakeReply } from "../../test-support/types/FakeReply";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));

const originalAdapter = api.defaults.adapter;
const PASSWORD = "correct horse battery";

beforeEach(() => {
  webViewMounts.count = 0;
  _resetPlatformForTests();
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession: async () => "unavailable",
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function renderScreen({ siteKey = FAKE_SITE_KEY, nameField }: { siteKey?: string; nameField?: RegisterNameField } = {}) {
  const onSignIn = jest.fn();
  await render(
    <RegisterScreen
      appName="MyRecipes"
      nameField={nameField}
      onSignIn={onSignIn}
      turnstileSiteKey={siteKey}
      webBaseUrl="https://web.test"
    />,
  );
  return onSignIn;
}

async function fillIn({ name = "", email = " new@example.com ", password = PASSWORD, agree = true } = {}) {
  await fireEvent.changeText(screen.getByLabelText(/^Name/), name);
  await fireEvent.changeText(screen.getByLabelText(/^Email/), email);
  await fireEvent.changeText(screen.getByLabelText(/^Password/), password);
  if (agree) await fireEvent.press(screen.getByRole("switch", { name: REGISTER_COPY.agreement }));
}

/** Taps Sign up and waits for the answer, if the form was sent. */
async function signUp() {
  await fireEvent.press(screen.getByRole("button", { name: REGISTER_COPY.submit }));
  await waitFor(() => expect(screen.queryByRole("button", { busy: true })).toBeNull());
}

const refusing = (reply: FakeReply) => serve({ "POST /auth/register": () => reply });

describe("RegisterScreen", () => {
  it("creates the account with the captcha token, then says to check the inbox and goes back to sign-in", async () => {
    const sent = serve({ "POST /auth/register": () => ({ status: 201, data: {} }) });
    const onSignIn = await renderScreen();
    await fillIn({ name: "  Ada  " });
    await passChallenge("token-1");
    await signUp();

    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ email: "new@example.com", password: PASSWORD, display_name: "Ada" });
    expect(sent[0].turnstileToken).toBe("token-1");
    expect(screen.getByRole("header", { name: AUTH_FORM_COPY.sentTitle })).toBeTruthy();
    expect(screen.getByText(REGISTER_COPY.sent("new@example.com"))).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: AUTH_FORM_COPY.backToSignIn }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("sends the name under the app's own key, and leaves a blank one out", async () => {
    const sent = serve({ "POST /auth/register": () => ({ status: 201, data: {} }) });
    await renderScreen({ nameField: "name" });
    await fillIn({ name: "Grace" });
    await passChallenge("t");
    await signUp();
    expect(sent[0].body).toEqual(expect.objectContaining({ name: "Grace" }));
    expect(sent[0].body).not.toHaveProperty("display_name");
  });

  it("leaves a blank name out", async () => {
    const sent = serve({ "POST /auth/register": () => ({ status: 201, data: {} }) });
    await renderScreen();
    await fillIn({ name: "   " });
    await passChallenge("t");
    await signUp();
    expect(sent[0].body).toEqual({ email: "new@example.com", password: PASSWORD });
  });

  it("sends no captcha header when the app has no site key", async () => {
    const sent = serve({ "POST /auth/register": () => ({ status: 201, data: {} }) });
    await renderScreen({ siteKey: "" });
    await fillIn();
    await signUp();
    expect(screen.queryByTestId("webview")).toBeNull();
    expect(sent[0].turnstileToken).toBeUndefined();
  });

  it("explains each missing piece rather than sending the form", async () => {
    const sent = serve({});
    await renderScreen();
    await fillIn({ email: "", password: "short", agree: false });
    await signUp();
    expect(screen.getByText(AUTH_FORM_COPY.emailRequired, SHOWN)).toBeTruthy();
    expect(screen.getByText(REGISTER_COPY.passwordTooShort, SHOWN)).toBeTruthy();
    expect(screen.getByText(REGISTER_COPY.agreementRequired, SHOWN)).toBeTruthy();
    expect(screen.getByText(TURNSTILE_COPY.required, SHOWN)).toBeTruthy();
    expect(sent).toEqual([]);

    await passChallenge("t");
    expect(screen.queryByText(TURNSTILE_COPY.required, SHOWN)).toBeNull();
  });

  it("shows it's creating the account from the tap, and sends it once", async () => {
    let answer: () => void = () => {};
    let requests = 0;
    api.defaults.adapter = (config) => {
      requests += 1;
      return new Promise((resolve) => {
        answer = () => resolve({ status: 201, data: {}, statusText: "", headers: {}, config });
      });
    };
    await renderScreen();
    await fillIn();
    await passChallenge("t");
    await fireEvent.press(screen.getByRole("button", { name: REGISTER_COPY.submit }));
    const busy = screen.getByRole("button", { name: REGISTER_COPY.submitting });
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(busy);
    expect(requests).toBe(1);

    await act(async () => answer());
    expect(await screen.findByRole("header", { name: AUTH_FORM_COPY.sentTitle })).toBeTruthy();
  });

  it.each([
    [{ status: 400, data: { detail: "REGISTER_USER_ALREADY_EXISTS" } }, "Email", REGISTER_COPY.emailTaken],
    [
      { status: 400, data: { detail: { code: "REGISTER_INVALID_PASSWORD", reason: "This password has appeared in a known data breach." } } },
      "Password",
      "This password has appeared in a known data breach.",
    ],
    [{ status: 422, data: { detail: [{ loc: ["body", "email"], msg: "not an email" }] } }, "Email", AUTH_FORM_COPY.emailInvalid],
  ] as const)("puts a refusal on the field to fix: %j", async (reply, field, message) => {
    refusing(reply);
    await renderScreen();
    await fillIn();
    await passChallenge("t");
    await signUp();
    expect(screen.getByLabelText(fieldLabel(field)).props.accessibilityLabel).toContain(message);
    expect(webViewMounts.count).toBe(2);
  });

  it.each([
    ["Captcha token required", 400, AUTH_FORM_COPY.captchaRejected],
    ["captcha_verification_failed", 400, AUTH_FORM_COPY.captchaRejected],
    ["captcha_expired_please_retry", 400, AUTH_FORM_COPY.captchaExpired],
  ])("asks for the check again after %s", async (detail, status, message) => {
    const sent = refusing({ status, data: { detail } });
    await renderScreen();
    await fillIn();
    await passChallenge("spent");
    await signUp();

    expect(screen.getByText(message, SHOWN)).toBeTruthy();
    expect(webViewMounts.count).toBe(2);
    // The spent token is gone: signing up again waits for a new one.
    await signUp();
    expect(sent).toHaveLength(1);
    expect(screen.getByText(TURNSTILE_COPY.required, SHOWN)).toBeTruthy();
    await passChallenge("fresh");
    await signUp();
    expect(sent.map((request) => request.turnstileToken)).toEqual(["spent", "fresh"]);
  });

  it.each([
    [{ status: 503, data: { detail: "captcha_service_misconfigured" } }, REGISTER_COPY.unavailable],
    [{ status: 503, data: { detail: "captcha_service_unavailable" } }, REGISTER_COPY.unavailable],
    [{ status: 429, data: { detail: "Too many attempts" } }, AUTH_FORM_COPY.rateLimited],
    [{ status: 502, data: null }, AUTH_FORM_COPY.unreachable("MyRecipes")],
    [{ status: 400, data: { detail: "SOMETHING_NEW" } }, AUTH_FORM_COPY.unexpected],
  ] as const)("explains %j above the button and starts the check over", async (reply, message) => {
    refusing(reply);
    await renderScreen();
    await fillIn();
    await passChallenge("t");
    await signUp();
    expect(screen.getByText(message, SHOWN)).toBeTruthy();
    expect(webViewMounts.count).toBe(2);
    expect(screen.getByLabelText(fieldLabel("Password")).props.value).toBe(PASSWORD);
  });

  it("explains a phone with no connection", async () => {
    api.defaults.adapter = async (config) => {
      throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    };
    await renderScreen();
    await fillIn();
    await passChallenge("t");
    await signUp();
    expect(screen.getByText(AUTH_FORM_COPY.unreachable("MyRecipes"), SHOWN)).toBeTruthy();
  });

  it("goes back to sign-in for someone who already has an account", async () => {
    const onSignIn = await renderScreen();
    await fireEvent.press(screen.getByRole("link", { name: REGISTER_COPY.haveAccount }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
