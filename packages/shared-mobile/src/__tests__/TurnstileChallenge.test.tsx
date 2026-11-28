import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Linking } from "react-native";
import TurnstileChallenge from "../components/TurnstileChallenge";
import ToastProvider from "../components/ToastProvider";
import { TURNSTILE_COPY } from "../constants/turnstile";
import type { TurnstileChallengeHandle } from "../types/TurnstileChallengeHandle";
import { webViewMounts } from "../../test-support/mockWebView";
import { SHOWN } from "../../test-support/shown";
import { FAKE_SITE_KEY, passChallenge, postFromChallenge } from "../../test-support/turnstile";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));

const WEBSITE = "https://myrecipes.example.org";

async function renderChallenge(siteKey = FAKE_SITE_KEY, error?: string) {
  const onToken = jest.fn();
  const onExpire = jest.fn();
  const ref = createRef<TurnstileChallengeHandle>();
  await render(
    <ToastProvider bottomOffset={0}>
      <TurnstileChallenge baseUrl={WEBSITE} error={error} onExpire={onExpire} onToken={onToken} ref={ref} siteKey={siteKey} />
    </ToastProvider>,
  );
  return { onToken, onExpire, ref };
}

function webView() {
  return screen.getByTestId("webview");
}

beforeEach(() => {
  webViewMounts.count = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("TurnstileChallenge", () => {
  it("shows nothing without a site key, as in development and tests", async () => {
    await renderChallenge("");
    expect(screen.queryByTestId("webview")).toBeNull();
    expect(screen.queryByText(TURNSTILE_COPY.label)).toBeNull();
  });

  it("loads its page as the app's website, so Cloudflare sees the allowed hostname", async () => {
    await renderChallenge();
    expect(webView().props.source).toEqual({ html: expect.stringContaining(FAKE_SITE_KEY), baseUrl: `${WEBSITE}/` });
    expect(webView().props.mixedContentMode).toBe("never");
  });

  it("shows it's loading until the widget is on screen", async () => {
    await renderChallenge();
    expect(screen.getByRole("progressbar", { name: TURNSTILE_COPY.loading })).toBeTruthy();
    await postFromChallenge({ type: "ready" });
    expect(screen.queryByRole("progressbar", { name: TURNSTILE_COPY.loading })).toBeNull();
  });

  it("hands over the token, then says when it expires", async () => {
    const { onToken, onExpire } = await renderChallenge();
    await passChallenge("token-1");
    expect(onToken).toHaveBeenCalledWith("token-1");
    await postFromChallenge({ type: "expired" });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("ignores anything that isn't one of its messages", async () => {
    const { onToken, onExpire } = await renderChallenge();
    await fireEvent(webView(), "message", { nativeEvent: { data: "not json" } });
    await fireEvent(webView(), "message", { nativeEvent: { data: JSON.stringify({ type: "token", token: 7 }) } });
    expect(onToken).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("starts a fresh check on reset, as a spent token can't be used again", async () => {
    const { ref } = await renderChallenge();
    await passChallenge("token-1");
    expect(webViewMounts.count).toBe(1);
    await act(async () => ref.current?.reset());
    expect(webViewMounts.count).toBe(2);
    expect(screen.getByRole("progressbar", { name: TURNSTILE_COPY.loading })).toBeTruthy();
  });

  it("explains a widget that couldn't load, and tries again", async () => {
    const { onExpire } = await renderChallenge();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await postFromChallenge({ type: "error", code: "script_load_failed" });
    expect(screen.getByText(TURNSTILE_COPY.failed, SHOWN)).toBeTruthy();
    expect(onExpire).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: TURNSTILE_COPY.retry }));
    expect(webViewMounts.count).toBe(2);
    await passChallenge("token-2");
    expect(screen.queryByText(TURNSTILE_COPY.failed, SHOWN)).toBeNull();
  });

  it("lets the widget get past a failed automatic check, as it shows its checkbox and tries again", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { onExpire, onToken } = await renderChallenge();
    await postFromChallenge({ type: "ready" });
    await postFromChallenge({ type: "error", code: "600010" });
    expect(screen.queryByText(TURNSTILE_COPY.failed, SHOWN)).toBeNull();
    expect(screen.queryByRole("button", { name: TURNSTILE_COPY.retry })).toBeNull();
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Turnstile error 600010");
    await passChallenge("token-after-retry");
    expect(onToken).toHaveBeenCalledWith("token-after-retry");
    expect(webViewMounts.count).toBe(1);
  });

  it("drops a token the widget had already given when its check then fails, keeping the widget", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { onExpire } = await renderChallenge();
    await passChallenge("token-1");
    expect(onExpire).not.toHaveBeenCalled();
    await postFromChallenge({ type: "error", code: "300030" });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(TURNSTILE_COPY.failed, SHOWN)).toBeNull();
    expect(webViewMounts.count).toBe(1);
  });

  it("explains a frame that couldn't load, as nothing would show, and offers a retry", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await renderChallenge();
    await postFromChallenge({ type: "ready" });
    await postFromChallenge({ type: "error", code: "200500" });
    expect(screen.getByText(TURNSTILE_COPY.failed, SHOWN)).toBeTruthy();
    expect(screen.getByRole("button", { name: TURNSTILE_COPY.retry })).toBeTruthy();
  });

  it("asks to fix the phone's clock when Cloudflare refuses it, and tries again", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await renderChallenge();
    await postFromChallenge({ type: "error", code: "200100" });
    expect(screen.getByText(TURNSTILE_COPY.clockWrong, SHOWN)).toBeTruthy();
    expect(screen.queryByText(TURNSTILE_COPY.failed, SHOWN)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: TURNSTILE_COPY.retry }));
    expect(webViewMounts.count).toBe(2);
  });

  it("explains an error the widget can't get past, such as an unauthorized hostname, and logs its code", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await renderChallenge();
    await postFromChallenge({ type: "error", code: "110200" });
    expect(screen.getByText(TURNSTILE_COPY.failed, SHOWN)).toBeTruthy();
    expect(warn).toHaveBeenCalledWith("Turnstile error 110200");
  });

  it("treats a page that couldn't load as a failed widget", async () => {
    await renderChallenge();
    await fireEvent(webView(), "error", { nativeEvent: { description: "offline" } });
    expect(screen.getByText(TURNSTILE_COPY.failed, SHOWN)).toBeTruthy();
  });

  it("shows the form's problem with the check", async () => {
    await renderChallenge(FAKE_SITE_KEY, TURNSTILE_COPY.required);
    expect(screen.getByText(TURNSTILE_COPY.required, SHOWN)).toBeTruthy();
  });

  describe("what loads inside", () => {
    it("is only its own page and Cloudflare's, and leaves the library's whitelist open so every load is checked here", async () => {
      const open = jest.spyOn(Linking, "openURL").mockClear().mockResolvedValue(undefined);
      await renderChallenge();
      const allow = webView().props.onShouldStartLoadWithRequest;
      expect(webView().props.originWhitelist).toEqual(["*"]);
      expect(allow({ url: `${WEBSITE}/`, isTopFrame: true })).toBe(true);
      expect(allow({ url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x", isTopFrame: false })).toBe(true);
      expect(allow({ url: "https://evil.example/frame", isTopFrame: false })).toBe(false);
      expect(allow({ url: "javascript:alert(1)", isTopFrame: true })).toBe(false);
      expect(open).not.toHaveBeenCalled();
    });

    it("opens a link the person taps in the phone's browser instead", async () => {
      const open = jest.spyOn(Linking, "openURL").mockClear().mockResolvedValue(undefined);
      await renderChallenge();
      const allow = webView().props.onShouldStartLoadWithRequest;
      await act(async () => {
        expect(allow({ url: "https://www.cloudflare.com/privacypolicy/", isTopFrame: true })).toBe(false);
      });
      await act(async () => webView().props.onOpenWindow({ nativeEvent: { targetUrl: "https://www.cloudflare.com/help" } }));
      await act(async () => webView().props.onOpenWindow({ nativeEvent: { targetUrl: "tel:5551234" } }));
      expect(open.mock.calls).toEqual([["https://www.cloudflare.com/privacypolicy/"], ["https://www.cloudflare.com/help"]]);
    });
  });

  it("refuses a website address that isn't http(s)", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      render(
        <ToastProvider bottomOffset={0}>
          <TurnstileChallenge baseUrl="myrecipes.example.org" onExpire={jest.fn()} onToken={jest.fn()} siteKey={FAKE_SITE_KEY} />
        </ToastProvider>,
      ),
    ).rejects.toThrow(/needs the website's http\(s\) address/);
  });
});
