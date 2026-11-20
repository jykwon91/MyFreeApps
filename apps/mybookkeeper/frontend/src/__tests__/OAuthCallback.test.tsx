import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { GMAIL_CONNECT_FAILURE_MESSAGES } from "@mybookkeeper/api-client/constants/gmailConnect";
import { GMAIL_CONNECT_POPUP_COPY } from "@/shared/lib/gmail-connect-messages";
import OAuthCallback from "@/app/pages/OAuthCallback";

const complete = vi.fn();

vi.mock("@mybookkeeper/api-client/store/integrationsApi", () => ({
  useCompleteGmailConnectMutation: () => [complete],
}));

function answers(outcome: "connects" | { status: number; data: { detail: string } }) {
  complete.mockImplementation(() => ({
    unwrap: () => (outcome === "connects" ? Promise.resolve() : Promise.reject(outcome)),
  }));
}

function landOn(query: string) {
  window.history.replaceState(null, "", `/oauth-callback?${query}`);
  return render(
    <StrictMode>
      <OAuthCallback />
    </StrictMode>,
  );
}

let postMessage: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;

function openedAsPopup(opened: boolean) {
  postMessage = vi.fn();
  close = vi.fn();
  Object.defineProperty(window, "opener", { value: opened ? { postMessage } : null, writable: true, configurable: true });
  Object.defineProperty(window, "close", { value: close, writable: true, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  openedAsPopup(true);
});

afterEach(() => {
  Object.defineProperty(window, "opener", { value: null, writable: true, configurable: true });
  window.history.replaceState(null, "", "/");
});

describe("OAuthCallback", () => {
  it("finishes the connection once, signed in, with Google's code and the state, then tells the opener and closes", async () => {
    answers("connects");
    landOn("code=c0de&state=signed.jwt");

    expect(screen.getByRole("status")).toHaveTextContent(GMAIL_CONNECT_POPUP_COPY.connecting);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: "gmail_connected" }, window.location.origin));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith({ code: "c0de", state: "signed.jwt" });
    expect(close).toHaveBeenCalled();
  });

  it("passes on why the server refused, someone else's connection included", async () => {
    answers({ status: 403, data: { detail: "wrong_account" } });
    landOn("code=c0de&state=signed.jwt");

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: "gmail_connect_failed", reason: "wrong_account" }, window.location.origin),
    );
    expect(close).toHaveBeenCalled();
  });

  it("sends nothing to the server when Google's answer was a refusal", async () => {
    landOn("result=error&reason=denied");

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: "gmail_connect_failed", reason: "denied" }, window.location.origin),
    );
    expect(complete).not.toHaveBeenCalled();
  });

  it("says why on the page when nothing opened it to tell", async () => {
    openedAsPopup(false);
    answers({ status: 403, data: { detail: "wrong_account" } });
    landOn("code=c0de&state=signed.jwt");

    expect(await screen.findByRole("alert")).toHaveTextContent(GMAIL_CONNECT_FAILURE_MESSAGES.wrong_account);
    expect(close).not.toHaveBeenCalled();
  });

  it("says it's connected on the page when nothing opened it to tell", async () => {
    openedAsPopup(false);
    answers("connects");
    landOn("code=c0de&state=signed.jwt");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(GMAIL_CONNECT_POPUP_COPY.connected));
    expect(close).not.toHaveBeenCalled();
  });

  it("treats an address with no code and state as a plain failure", async () => {
    openedAsPopup(false);
    landOn("");

    expect(await screen.findByRole("alert")).toHaveTextContent(GMAIL_CONNECT_FAILURE_MESSAGES.failed);
    expect(complete).not.toHaveBeenCalled();
  });
});
