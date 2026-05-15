import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PasswordPair from "../components/auth/PasswordPair";

function renderPair(
  overrides: Partial<Parameters<typeof PasswordPair>[0]> = {},
) {
  const defaults = {
    password: "",
    onPasswordChange: vi.fn(),
    confirmPassword: "",
    onConfirmPasswordChange: vi.fn(),
  };
  return render(<PasswordPair {...defaults} {...overrides} />);
}

describe("PasswordPair — too-short feedback", () => {
  it("shows a visible destructive alert when the password is too short", () => {
    // Regression: previously only aria-invalid was set (screen-reader
    // only) and the submit button silently disabled — sighted users
    // saw no error at all.
    renderPair({ password: "short" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/at least 12 characters/i);
    expect(alert.className).toContain("text-destructive");
  });

  it("shows only the muted hint (no alert) before any input", () => {
    renderPair({ password: "" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/at least 12 characters/i).className).toContain(
      "text-muted-foreground",
    );
  });

  it("drops the too-short alert once the minimum length is met", () => {
    renderPair({ password: "abcdefghijkl", confirmPassword: "abcdefghijkl" });
    const hint = screen.getByText(/at least 12 characters/i);
    expect(hint.className).toContain("text-muted-foreground");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("respects a custom minLength in the message", () => {
    renderPair({ password: "abc", minLength: 8 });
    expect(screen.getByRole("alert")).toHaveTextContent(
      /at least 8 characters/i,
    );
  });
});
