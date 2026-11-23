import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ResetPassword from "@/pages/ResetPassword";

vi.mock("@/lib/auth", () => ({
  resetPassword: vi.fn().mockRejectedValue(new Error("boom")),
}));

function renderReset(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResetPassword page", () => {
  it("announces a failed reset as an alert", async () => {
    renderReset("/reset-password?token=abc123");
    const password = "a-long-enough-password";
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: password } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("removes the token from the address bar", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderReset("/reset-password?token=abc123");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reset-password");
    replaceState.mockRestore();
  });
});
