/**
 * InviteRegisterForm + Turnstile: tokens are single-use, so after a failed
 * submit the form must reset the widget and keep "Create account" disabled
 * until a fresh token arrives. Uses the real TurnstileWidget against a mocked
 * `window.turnstile`.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InviteRegisterForm from "@/features/invite/InviteRegisterForm";

vi.mock("@/lib/auth", () => ({
  register: vi.fn(),
}));

import { register } from "@/lib/auth";

const renderMock = vi.fn((_el: HTMLElement, _options: Record<string, unknown>) => "widget-1");
const resetMock = vi.fn();

function solveTurnstile(token: string) {
  const options = renderMock.mock.calls[0][1];
  act(() => (options.callback as (t: string) => void)(token));
}

function submitButton() {
  return screen.getByRole("button", { name: "Create account" });
}

describe("InviteRegisterForm — Turnstile reset after a failed submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    window.turnstile = { render: renderMock, reset: resetMock, remove: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
  });

  it("resets the widget on a server error and retries with the fresh token", async () => {
    vi.mocked(register)
      .mockRejectedValueOnce({ response: { status: 429, data: { detail: "Too many requests" } } })
      .mockResolvedValueOnce(undefined);
    const onRegistered = vi.fn();
    render(<InviteRegisterForm email="invitee@example.com" onRegistered={onRegistered} />);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenoughpassword" } });
    expect(submitButton()).toBeDisabled();
    solveTurnstile("tok-1");
    expect(submitButton()).toBeEnabled();

    fireEvent.click(submitButton());
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith("widget-1"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    solveTurnstile("tok-2");
    fireEvent.click(submitButton());

    await waitFor(() => expect(onRegistered).toHaveBeenCalledTimes(1));
    expect(vi.mocked(register).mock.calls[0][2]).toBe("tok-1");
    expect(vi.mocked(register).mock.calls[1][2]).toBe("tok-2");
  });

  it("leaves submit gated only by the password when Turnstile is off", () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    render(<InviteRegisterForm email="invitee@example.com" onRegistered={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenoughpassword" } });
    expect(submitButton()).toBeEnabled();
    expect(renderMock).not.toHaveBeenCalled();
  });
});
