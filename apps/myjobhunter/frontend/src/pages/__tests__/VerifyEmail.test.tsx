import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VerifyEmail from "@/pages/VerifyEmail";

vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from "@/lib/api";

const mockApiPost = vi.mocked(api.post);

function renderVerify(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VerifyEmail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the token to /auth/verify on mount and shows success on 200", async () => {
    mockApiPost.mockResolvedValueOnce({ data: { is_verified: true } });

    renderVerify("/verify-email?token=abc123");

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/auth/verify", {
        token: "abc123",
      });
    });
    expect(
      await screen.findByText(/your email has been verified/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows the verifying spinner while the request is in flight", () => {
    mockApiPost.mockReturnValueOnce(new Promise(() => {})); // never resolves
    renderVerify("/verify-email?token=abc123");
    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows error state when the API returns 4xx", async () => {
    const err = {
      data: { detail: "VERIFY_USER_BAD_TOKEN" },
    };
    mockApiPost.mockRejectedValueOnce(err);

    renderVerify("/verify-email?token=invalid");

    expect(
      await screen.findByText(/VERIFY_USER_BAD_TOKEN/i),
    ).toBeInTheDocument();
    // Link to login still rendered so the user can request a new email
    expect(screen.getByRole("link", { name: /go to sign in/i })).toBeInTheDocument();
  });

  it("shows an error when no token is in the query string", async () => {
    renderVerify("/verify-email");

    expect(
      await screen.findByText(/no verification token found/i),
    ).toBeInTheDocument();
    // Should not have called the API
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
