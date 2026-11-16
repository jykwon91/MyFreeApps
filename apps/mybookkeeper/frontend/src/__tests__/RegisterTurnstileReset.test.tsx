/**
 * Register + Turnstile: tokens are single-use, so after a failed submit the
 * page must reset the widget and keep "Sign up" disabled until a fresh token
 * arrives. Uses the real TurnstileWidget against a mocked `window.turnstile`.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Register from "@/app/pages/Register";

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

import api from "@/shared/lib/api";

const renderMock = vi.fn((_el: HTMLElement, _options: Record<string, unknown>) => "widget-1");
const resetMock = vi.fn();

function solveTurnstile(token: string) {
  const options = renderMock.mock.calls[0][1];
  act(() => (options.callback as (t: string) => void)(token));
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  await user.type(container.querySelector("input[type='email']") as HTMLElement, "user@example.com");
  await user.type(container.querySelector("input[type='password']") as HTMLElement, "longenoughpassword");
  await user.click(screen.getByTestId("terms-checkbox"));
}

describe("Register — Turnstile reset after a failed submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    window.turnstile = { render: renderMock, reset: resetMock, remove: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
  });

  it("keeps Sign up disabled until the widget produces a token", async () => {
    const user = userEvent.setup();
    const { container } = render(<BrowserRouter><Register /></BrowserRouter>);
    await fillForm(user, container);
    expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
    solveTurnstile("tok-1");
    expect(screen.getByRole("button", { name: "Sign up" })).toBeEnabled();
  });

  it("resets the widget on a server error and retries with the fresh token", async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce({ response: { status: 400, data: { detail: "REGISTER_USER_ALREADY_EXISTS" } } })
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    const { container } = render(<BrowserRouter><Register /></BrowserRouter>);
    await fillForm(user, container);
    solveTurnstile("tok-1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(resetMock).toHaveBeenCalledWith("widget-1"));
    expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();

    solveTurnstile("tok-2");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await screen.findByText("Check your inbox");
    expect(vi.mocked(api.post).mock.calls[0][2]).toEqual({ headers: { "X-Turnstile-Token": "tok-1" } });
    expect(vi.mocked(api.post).mock.calls[1][2]).toEqual({ headers: { "X-Turnstile-Token": "tok-2" } });
  });
});
