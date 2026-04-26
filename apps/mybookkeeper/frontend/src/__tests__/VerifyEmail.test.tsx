import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import VerifyEmail from "@/app/pages/VerifyEmail";

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@/shared/utils/errorMessage", () => ({
  extractErrorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === "object" && err !== null) {
      const obj = err as Record<string, unknown>;
      if (typeof obj.data === "object" && obj.data !== null) {
        const data = obj.data as Record<string, unknown>;
        if (typeof data.detail === "string") return data.detail;
      }
    }
    return "An unexpected error occurred";
  },
}));

import api from "@/shared/lib/api";

function renderVerifyEmail(search = "") {
  window.history.pushState({}, "", "/verify-email" + search);
  return render(
    <BrowserRouter>
      <VerifyEmail />
    </BrowserRouter>
  );
}

describe("VerifyEmail — no token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows error when no token is in the URL", async () => {
    renderVerifyEmail();

    await waitFor(() => {
      expect(screen.queryByText(/verifying your email/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/no verification token/i)).toBeInTheDocument();
  });

  it("does not call the API when no token is present", async () => {
    renderVerifyEmail();

    await waitFor(() => expect(api.post).not.toHaveBeenCalled());
  });
});

describe("VerifyEmail — success", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls POST /auth/verify with the token from the URL", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    renderVerifyEmail("?token=valid-token-abc");

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/verify", { token: "valid-token-abc" });
    });
  });

  it("shows success message after verification", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    renderVerifyEmail("?token=valid-token-abc");

    await screen.findByText(/your email has been verified/i);
  });

  it("shows a sign in link after successful verification", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    renderVerifyEmail("?token=valid-token-abc");

    const link = await screen.findByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/login");
  });
});

describe("VerifyEmail — error", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows error message when API returns an error", async () => {
    vi.mocked(api.post).mockRejectedValue({ data: { detail: "VERIFY_TOKEN_INVALID" } });
    renderVerifyEmail("?token=bad-token");

    await screen.findByText("VERIFY_TOKEN_INVALID");
  });

  it("shows a generic error when API error has no message", async () => {
    vi.mocked(api.post).mockRejectedValue({});
    renderVerifyEmail("?token=bad-token");

    await screen.findByText(/unexpected error/i);
  });

  it("shows a link to login page after error", async () => {
    vi.mocked(api.post).mockRejectedValue({});
    renderVerifyEmail("?token=bad-token");

    await screen.findByText(/go to login/i);
    const link = screen.getByRole("link", { name: /go to login/i });
    expect(link).toHaveAttribute("href", "/login");
  });
});

describe("VerifyEmail — loading state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading spinner initially when token is present", () => {
    vi.mocked(api.post).mockReturnValue(new Promise(() => {})); // never resolves
    renderVerifyEmail("?token=abc");

    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument();
  });
});
