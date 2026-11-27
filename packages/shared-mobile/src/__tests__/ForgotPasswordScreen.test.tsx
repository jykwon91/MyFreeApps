import api from "@platform/core/lib/api";
import { _resetPlatformForTests, configurePlatform } from "@platform/core/platform/configurePlatform";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import ForgotPasswordScreen from "../components/ForgotPasswordScreen";
import { AUTH_FORM_COPY, FORGOT_PASSWORD_COPY } from "../constants/authForms";
import { TURNSTILE_COPY } from "../constants/turnstile";
import { serve } from "../../test-support/fakeServer";
import { fieldLabel } from "../../test-support/fieldLabelPattern";
import { webViewMounts } from "../../test-support/mockWebView";
import { SHOWN } from "../../test-support/shown";
import { FAKE_SITE_KEY, passChallenge } from "../../test-support/turnstile";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));

const originalAdapter = api.defaults.adapter;

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

async function renderScreen(siteKey = FAKE_SITE_KEY) {
  const onSignIn = jest.fn();
  await render(
    <ForgotPasswordScreen appName="MyRecipes" onSignIn={onSignIn} turnstileSiteKey={siteKey} webBaseUrl="https://web.test" />,
  );
  return onSignIn;
}

/** Taps the button and waits for the answer, if the form was sent. */
async function send() {
  await fireEvent.press(screen.getByRole("button", { name: FORGOT_PASSWORD_COPY.submit }));
  await waitFor(() => expect(screen.queryByRole("button", { busy: true })).toBeNull());
}

describe("ForgotPasswordScreen", () => {
  it("asks for the reset link with the captcha token, then says where the link opens", async () => {
    const sent = serve({ "POST /auth/forgot-password": () => ({ status: 202, data: null }) });
    const onSignIn = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("Email"), " me@example.com ");
    await passChallenge("token-1");
    await send();

    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ email: "me@example.com" });
    expect(sent[0].turnstileToken).toBe("token-1");
    expect(screen.getByRole("header", { name: AUTH_FORM_COPY.sentTitle })).toBeTruthy();
    expect(screen.getByText(FORGOT_PASSWORD_COPY.sent("me@example.com"))).toBeTruthy();
    expect(screen.getByText(FORGOT_PASSWORD_COPY.opensOnWebsite)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: AUTH_FORM_COPY.backToSignIn }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("needs an email and the check before it sends anything", async () => {
    const sent = serve({});
    await renderScreen();
    await send();
    expect(screen.getByLabelText(fieldLabel("Email")).props.accessibilityLabel).toContain(AUTH_FORM_COPY.emailRequired);
    expect(screen.getByText(TURNSTILE_COPY.required, SHOWN)).toBeTruthy();
    expect(sent).toEqual([]);
  });

  it("sends no captcha header when the app has no site key", async () => {
    const sent = serve({ "POST /auth/forgot-password": () => ({ status: 202, data: null }) });
    await renderScreen("");
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@example.com");
    await send();
    expect(sent[0].turnstileToken).toBeUndefined();
    expect(screen.getByRole("header", { name: AUTH_FORM_COPY.sentTitle })).toBeTruthy();
  });

  it("shows it's sending from the tap, and sends once", async () => {
    let answer: () => void = () => {};
    let requests = 0;
    api.defaults.adapter = (config) => {
      requests += 1;
      return new Promise((resolve) => {
        answer = () => resolve({ status: 202, data: null, statusText: "", headers: {}, config });
      });
    };
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@example.com");
    await passChallenge("t");
    await fireEvent.press(screen.getByRole("button", { name: FORGOT_PASSWORD_COPY.submit }));
    const busy = screen.getByRole("button", { name: FORGOT_PASSWORD_COPY.submitting });
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(busy);
    expect(requests).toBe(1);

    await act(async () => answer());
    expect(await screen.findByRole("header", { name: AUTH_FORM_COPY.sentTitle })).toBeTruthy();
  });

  it.each([
    ["Captcha token required", 400, AUTH_FORM_COPY.captchaRejected],
    ["captcha_verification_failed", 400, AUTH_FORM_COPY.captchaRejected],
    ["captcha_expired_please_retry", 400, AUTH_FORM_COPY.captchaExpired],
    ["captcha_service_misconfigured", 503, FORGOT_PASSWORD_COPY.unavailable],
    ["captcha_service_unavailable", 503, FORGOT_PASSWORD_COPY.unavailable],
    ["Too many attempts", 429, AUTH_FORM_COPY.rateLimited],
    ["Bad gateway", 502, AUTH_FORM_COPY.unreachable("MyRecipes")],
  ])("explains %s and starts the check over for a new token", async (detail, status, message) => {
    const sent = serve({ "POST /auth/forgot-password": () => ({ status, data: { detail } }) });
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@example.com");
    await passChallenge("spent");
    await send();

    expect(screen.getByText(message, SHOWN)).toBeTruthy();
    expect(webViewMounts.count).toBe(2);
    await passChallenge("fresh");
    await send();
    expect(sent.map((request) => request.turnstileToken)).toEqual(["spent", "fresh"]);
  });

  it("puts a rejected address on the email field", async () => {
    serve({
      "POST /auth/forgot-password": () => ({ status: 422, data: { detail: [{ loc: ["body", "email"], msg: "not an email" }] } }),
    });
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@example");
    await passChallenge("t");
    await send();
    expect(screen.getByLabelText(fieldLabel("Email")).props.accessibilityLabel).toContain(AUTH_FORM_COPY.emailInvalid);
    expect(webViewMounts.count).toBe(2);
  });

  it("goes back to sign-in", async () => {
    const onSignIn = await renderScreen();
    await fireEvent.press(screen.getByRole("link", { name: AUTH_FORM_COPY.backToSignIn }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
