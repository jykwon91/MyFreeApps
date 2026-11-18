import { GMAIL_CONNECT_RETURN_PATH, GMAIL_CONNECT_RETURN_URL } from "../../constants/gmailConnect";

function isGmailConnectReturn(path: string): boolean {
  const rest = [GMAIL_CONNECT_RETURN_URL, `/${GMAIL_CONNECT_RETURN_PATH}`].find((prefix) => path.startsWith(prefix));
  if (rest === undefined) return false;
  const next = path.charAt(rest.length);
  return next === "" || next === "?" || next === "/" || next === "#";
}

/**
 * Expo Router's hook for links that open the app. Android opens the app with Google's answer
 * as well as handing it to the sign-in browser's promise, so without this the router would
 * show "not found" for it. The answer is read by useConnectGmail, so the app stays where it is.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  return isGmailConnectReturn(path) ? null : path;
}
