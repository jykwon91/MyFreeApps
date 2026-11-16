import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";

const SUCCESS_HEADING = "Check your inbox";

function axiosFailure(status: number | null, data: unknown = ""): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  if (status === null) {
    return new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
  }
  return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_RESPONSE, config, undefined, {
    status,
    statusText: "",
    headers: {},
    config,
    data,
  });
}

function renderPage(onRequestReset: (email: string, token: string) => Promise<void>) {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage onRequestReset={onRequestReset} />
    </MemoryRouter>,
  );
}

async function submitEmail(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
}

describe("ForgotPasswordPage — success", () => {
  it("shows the anti-enumeration success copy only after a 2xx", async () => {
    const onRequestReset = vi.fn().mockResolvedValue(undefined);
    renderPage(onRequestReset);

    await submitEmail("  user@example.com ");

    expect(await screen.findByRole("heading", { name: SUCCESS_HEADING })).toBeInTheDocument();
    expect(onRequestReset).toHaveBeenCalledWith("user@example.com", "");
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText(/If an account exists for/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
  });

  it("uses the app's heading, icon and login path", () => {
    render(
      <MemoryRouter>
        <ForgotPasswordPage
          onRequestReset={vi.fn()}
          heading="MyBookkeeper"
          icon={<span data-testid="brand-icon" />}
          loginPath="/signin"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "MyBookkeeper" })).toBeInTheDocument();
    expect(screen.getByTestId("brand-icon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/signin");
  });
});

describe("ForgotPasswordPage — failures never claim an email was sent", () => {
  it.each([
    ["429 rate limit", axiosFailure(429, { detail: "Too many attempts" }), "Too many attempts. Wait a few minutes and try again."],
    [
      "400 captcha refusal",
      axiosFailure(400, { detail: "captcha_verification_failed" }),
      "We couldn't verify the captcha check. Please complete it again and retry.",
    ],
    ["500 with no body", axiosFailure(500), "Something went wrong. Please try again."],
    ["network failure", axiosFailure(null), "Something went wrong. Please try again."],
  ])("%s shows an error, keeps the email and lets the user retry", async (_label, failure, message) => {
    const onRequestReset = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    renderPage(onRequestReset);

    await submitEmail("user@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("heading", { name: SUCCESS_HEADING })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("user@example.com");
    const button = screen.getByRole("button", { name: "Send reset link" });
    expect(button).toBeEnabled();

    await userEvent.setup().click(button);
    expect(await screen.findByRole("heading", { name: SUCCESS_HEADING })).toBeInTheDocument();
    expect(onRequestReset).toHaveBeenCalledTimes(2);
  });

  it("shows loading and disables the button while the request is in flight", async () => {
    let reject: (reason: unknown) => void = () => {};
    const onRequestReset = vi.fn(() => new Promise<void>((_resolve, rej) => { reject = rej; }));
    renderPage(onRequestReset);

    await submitEmail("user@example.com");

    const busy = screen.getByRole("button", { name: /Sending/ });
    expect(busy).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();

    await act(async () => reject(axiosFailure(500)));
    expect(await screen.findByRole("button", { name: "Send reset link" })).toBeEnabled();
  });

  it("asks for an email instead of sending an empty request", async () => {
    const onRequestReset = vi.fn();
    const { container } = renderPage(onRequestReset);
    const input = screen.getByLabelText("Email");
    input.removeAttribute("required");

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Email is required");
    expect(onRequestReset).not.toHaveBeenCalled();
  });

  it("keeps the button disabled until an email is typed", () => {
    renderPage(vi.fn());
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeDisabled();
  });
});

describe("ForgotPasswordPage — Turnstile", () => {
  const renderMock = vi.fn((_el: HTMLElement, _options: Record<string, unknown>) => "widget-1");
  const resetMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    renderMock.mockClear();
    resetMock.mockClear();
    window.turnstile = { render: renderMock, reset: resetMock, remove: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
  });

  function solveCaptcha(token: string) {
    const options = renderMock.mock.calls[0][1];
    act(() => (options.callback as (t: string) => void)(token));
  }

  it("sends the token and, after a failure, re-challenges before the retry", async () => {
    const onRequestReset = vi
      .fn()
      .mockRejectedValueOnce(axiosFailure(400, { detail: "captcha_expired_please_retry" }))
      .mockResolvedValueOnce(undefined);
    renderPage(onRequestReset);
    solveCaptcha("token-1");

    await submitEmail("user@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The captcha check expired. Please complete it again and retry.",
    );
    expect(onRequestReset).toHaveBeenCalledWith("user@example.com", "token-1");
    expect(resetMock).toHaveBeenCalledWith("widget-1");
    const button = screen.getByRole("button", { name: "Send reset link" });
    expect(button).toBeDisabled();

    solveCaptcha("token-2");
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.setup().click(button);

    expect(await screen.findByRole("heading", { name: SUCCESS_HEADING })).toBeInTheDocument();
    expect(onRequestReset).toHaveBeenLastCalledWith("user@example.com", "token-2");
  });

  it("does not reset the captcha after a success", async () => {
    renderPage(vi.fn().mockResolvedValue(undefined));
    solveCaptcha("token-1");

    await submitEmail("user@example.com");

    expect(await screen.findByRole("heading", { name: SUCCESS_HEADING })).toBeInTheDocument();
    expect(resetMock).not.toHaveBeenCalled();
  });
});
