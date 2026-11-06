import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VerifyEmail from "@/pages/VerifyEmail";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

import api from "@/lib/api";

const mockApiPost = vi.mocked(api.post);

/** axios rejection: body at err.response.data, .message is the status line. */
function axiosError(detail: string): Error {
  return Object.assign(new Error("Request failed with status code 400"), {
    response: { status: 400, data: { detail } },
  });
}

function renderVerify(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VerifyEmail page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts the token and shows success", async () => {
    mockApiPost.mockResolvedValueOnce({ data: {} });
    renderVerify("/verify-email?token=abc123");
    expect(await screen.findByText(/your email has been verified/i)).toBeInTheDocument();
    expect(mockApiPost).toHaveBeenCalledWith("/auth/verify", { token: "abc123" });
  });

  it("treats an already-verified email (second click) as success", async () => {
    mockApiPost.mockRejectedValueOnce(axiosError("VERIFY_USER_ALREADY_VERIFIED"));
    renderVerify("/verify-email?token=abc123");
    expect(await screen.findByText(/your email has been verified/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't verify|VERIFY_USER/i)).not.toBeInTheDocument();
  });

  it("says the link is invalid or expired for a bad token", async () => {
    mockApiPost.mockRejectedValueOnce(axiosError("VERIFY_USER_BAD_TOKEN"));
    renderVerify("/verify-email?token=bad");
    expect(
      await screen.findByText("This verification link is invalid or has expired."),
    ).toBeInTheDocument();
  });
});
