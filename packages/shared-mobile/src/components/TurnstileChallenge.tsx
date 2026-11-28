import { useCallback, useImperativeHandle, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest, WebViewOpenWindowEvent } from "react-native-webview/lib/WebViewTypes";
import { TURNSTILE_CLOCK_ERROR_CODE, TURNSTILE_COPY, TURNSTILE_FRAME_HEIGHT, TURNSTILE_FRAME_WIDTH } from "../constants/turnstile";
import { useOpenLink } from "../hooks/useOpenLink";
import { useTheme } from "../theme/useTheme";
import type { TurnstileChallengeProps } from "../types/TurnstileChallengeProps";
import type { TurnstileStatus } from "../types/TurnstileStatus";
import { isHttpsUrl } from "../utils/isHttpsUrl";
import { isSelfRetryingTurnstileError } from "../utils/isSelfRetryingTurnstileError";
import { parseTurnstileMessage } from "../utils/parseTurnstileMessage";
import { turnstileHtml } from "../utils/turnstileHtml";
import { turnstileNavigation } from "../utils/turnstileNavigation";
import { webOrigin } from "../utils/webOrigin";
import FieldError from "./FieldError";
import LoadingButton from "./LoadingButton";
import LoadingRegion from "./LoadingRegion";
import Skeleton from "./Skeleton";

/**
 * Cloudflare Turnstile on the phone, which has no browser page to put it on: a small WebView showing a page of our
 * own, loaded as the app's website so the site key's hostname matches. Its callbacks post back the token, an expiry
 * or an error. Only that page and Cloudflare's widget load inside; a link the widget opens goes to the browser.
 * Renders nothing without a site key, as the website's widget does, so development and tests skip the check.
 * Needs a ToastProvider above it, to say when the phone can't open a link.
 */
export default function TurnstileChallenge({ siteKey, baseUrl, onToken, onExpire, error, ref }: TurnstileChallengeProps) {
  const { isDark, colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<TurnstileStatus>("loading");
  const documentOrigin = useMemo(() => {
    const origin = webOrigin(baseUrl);
    if (!origin) throw new Error(`TurnstileChallenge needs the website's http(s) address as baseUrl, not ${JSON.stringify(baseUrl)}.`);
    return origin;
  }, [baseUrl]);
  const html = useMemo(() => turnstileHtml(siteKey, isDark), [siteKey, isDark]);

  // A new key gives a new WebView, so a fresh widget and token.
  const restart = useCallback(() => {
    setAttempt((current) => current + 1);
    setStatus("loading");
  }, []);
  useImperativeHandle(ref, () => ({ reset: restart }), [restart]);

  function lose(next: TurnstileStatus): void {
    setStatus(next);
    onExpire();
  }

  function receive(event: WebViewMessageEvent): void {
    const message = parseTurnstileMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === "ready") setStatus("ready");
    if (message.type === "token") {
      setStatus("ready");
      onToken(message.token);
    }
    if (message.type === "expired") onExpire();
    if (message.type === "error") {
      // The code is the only clue to why a check failed; Cloudflare documents each one.
      console.warn(`Turnstile error ${message.code}`);
      // The widget is still there and tries again, so only any earlier token is gone.
      if (isSelfRetryingTurnstileError(message.code)) onExpire();
      else lose(message.code === TURNSTILE_CLOCK_ERROR_CODE ? "clockWrong" : "failed");
    }
  }

  function allowLoad({ url, isTopFrame }: ShouldStartLoadRequest): boolean {
    // Android may leave isTopFrame out; treat that as the page itself, which only ever opens outside.
    const navigation = turnstileNavigation(url, documentOrigin, isTopFrame !== false);
    if (navigation === "openOutside") void openLink(url);
    return navigation === "load";
  }

  function openWindow({ nativeEvent }: WebViewOpenWindowEvent): void {
    if (isHttpsUrl(nativeEvent.targetUrl)) void openLink(nativeEvent.targetUrl);
  }

  // After every hook, so a site key that arrives later doesn't change their order.
  if (!siteKey) return null;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.foreground, fontSize: fontSize.xs, fontWeight: "500" }}>{TURNSTILE_COPY.label}</Text>
      <View style={{ height: TURNSTILE_FRAME_HEIGHT }}>
        <WebView
          allowsLinkPreview={false}
          bounces={false}
          javaScriptEnabled
          key={attempt}
          mixedContentMode="never"
          onContentProcessDidTerminate={() => {
            restart();
            onExpire();
          }}
          onError={() => lose("failed")}
          onMessage={receive}
          onOpenWindow={openWindow}
          onRenderProcessGone={() => {
            restart();
            onExpire();
          }}
          onShouldStartLoadWithRequest={allowLoad}
          // Every load goes through allowLoad. The library's own whitelist would hand anything it doesn't list,
          // of any scheme and from any frame, to the phone to open.
          originWhitelist={["*"]}
          overScrollMode="never"
          scrollEnabled={false}
          setBuiltInZoomControls={false}
          source={{ html, baseUrl: `${documentOrigin}/` }}
          style={{ backgroundColor: "transparent" }}
        />
        {status === "loading" ? (
          <LoadingRegion label={TURNSTILE_COPY.loading} style={[StyleSheet.absoluteFill, { alignItems: "center" }]}>
            <Skeleton height={TURNSTILE_FRAME_HEIGHT} style={{ maxWidth: "100%" }} width={TURNSTILE_FRAME_WIDTH} />
          </LoadingRegion>
        ) : null}
      </View>
      {status === "failed" || status === "clockWrong" ? (
        <>
          <FieldError message={TURNSTILE_COPY[status]} name={TURNSTILE_COPY.label} />
          <LoadingButton onPress={restart} variant="secondary">
            {TURNSTILE_COPY.retry}
          </LoadingButton>
        </>
      ) : (
        <FieldError message={error} name={TURNSTILE_COPY.label} />
      )}
    </View>
  );
}
