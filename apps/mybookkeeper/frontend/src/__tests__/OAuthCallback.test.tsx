import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import OAuthCallback from "@/app/pages/OAuthCallback";

function renderOAuthCallback() {
  return render(<OAuthCallback />);
}

describe("OAuthCallback — UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the connecting status message", () => {
    renderOAuthCallback();

    expect(
      screen.getByText(/Connecting/i)
    ).toBeInTheDocument();
  });

  it("tells the user the window will close automatically", () => {
    renderOAuthCallback();

    expect(
      screen.getByText(/this window will close automatically/i)
    ).toBeInTheDocument();
  });
});

describe("OAuthCallback — when opened as a popup (window.opener exists)", () => {
  let originalOpener: typeof window.opener;
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalOpener = window.opener;
    postMessageSpy = vi.fn();
    closeSpy = vi.fn();

    Object.defineProperty(window, "opener", {
      value: { postMessage: postMessageSpy },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "close", {
      value: closeSpy,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "opener", {
      value: originalOpener,
      writable: true,
      configurable: true,
    });
  });

  it("posts a gmail_connected message to the opener", () => {
    renderOAuthCallback();

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "gmail_connected" },
      window.location.origin
    );
  });

  it("closes the popup window after posting the message", () => {
    renderOAuthCallback();

    expect(closeSpy).toHaveBeenCalled();
  });

  it("posts the message before closing the window", () => {
    const callOrder: string[] = [];
    postMessageSpy.mockImplementation(() => callOrder.push("postMessage"));
    closeSpy.mockImplementation(() => callOrder.push("close"));

    renderOAuthCallback();

    expect(callOrder).toEqual(["postMessage", "close"]);
  });
});

describe("OAuthCallback — when not opened as a popup (no window.opener)", () => {
  let originalOpener: typeof window.opener;
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalOpener = window.opener;
    closeSpy = vi.fn();

    Object.defineProperty(window, "opener", {
      value: null,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "close", {
      value: closeSpy,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "opener", {
      value: originalOpener,
      writable: true,
      configurable: true,
    });
  });

  it("does not call window.close when there is no opener", () => {
    renderOAuthCallback();

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("still renders the status message when there is no opener", () => {
    renderOAuthCallback();

    expect(screen.getByText(/Connecting/i)).toBeInTheDocument();
  });
});
