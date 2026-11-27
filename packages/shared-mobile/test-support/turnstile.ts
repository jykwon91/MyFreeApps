import { fireEvent, screen } from "@testing-library/react-native";
import type { TurnstileMessage } from "../src/types/TurnstileMessage";

/** A fake key: with one, the screens show the (mocked) captcha and wait for its token. */
export const FAKE_SITE_KEY = "0xFAKE_SITE_KEY";

/** Posts `message` from the captcha page, as its Turnstile callbacks do. Needs mockWebView. */
export async function postFromChallenge(message: TurnstileMessage): Promise<void> {
  await fireEvent(screen.getByTestId("webview"), "message", { nativeEvent: { data: JSON.stringify(message) } });
}

/** The person passes the captcha and Cloudflare hands back `token`. */
export async function passChallenge(token: string): Promise<void> {
  await postFromChallenge({ type: "ready" });
  await postFromChallenge({ type: "token", token });
}
