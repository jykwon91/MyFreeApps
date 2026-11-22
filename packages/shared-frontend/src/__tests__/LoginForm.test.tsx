import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import LoginForm from "../components/auth/LoginForm";

function noop() {
  return Promise.resolve();
}

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname + location.search}</div>;
}

describe("LoginForm", () => {
  it("renders Sign In tab by default", () => {
    render(<LoginForm onSignIn={noop} onRegister={noop} />);
    expect(screen.getByRole("tab", { name: "Sign In" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("tab", { name: "Create Account" })).toHaveAttribute(
      "data-state",
      "inactive"
    );
  });

  it("renders Create Account tab when defaultTab=register", () => {
    render(<LoginForm onSignIn={noop} onRegister={noop} defaultTab="register" />);
    expect(screen.getByRole("tab", { name: "Create Account" })).toHaveAttribute(
      "data-state",
      "active"
    );
  });

  it("switches to Create Account tab and clears form state", async () => {
    render(<LoginForm onSignIn={noop} onRegister={noop} />);

    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    await userEvent.type(emailInput, "test@example.com");
    expect(emailInput.value).toBe("test@example.com");

    await userEvent.click(screen.getByRole("tab", { name: "Create Account" }));

    // After switching, the form fields should be cleared
    const clearedEmail = screen.getByLabelText("Email") as HTMLInputElement;
    expect(clearedEmail.value).toBe("");
  });

  it("calls onSignIn with email and password on submit", async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onSignIn={onSignIn} onRegister={noop} />);

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(onSignIn).toHaveBeenCalledWith("user@example.com", "secret123");
    });
  });

  it("keeps Sign In disabled until both email and password are filled", async () => {
    render(<LoginForm onSignIn={noop} onRegister={noop} />);
    const submit = screen.getByRole("button", { name: "Sign In" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Password"), "secret123");
    expect(submit).toBeEnabled();
  });

  it("calls onRegister on Create Account submit", async () => {
    const onRegister = vi.fn().mockResolvedValue(undefined);
    render(
      <LoginForm onSignIn={noop} onRegister={onRegister} defaultTab="register" passwordMinLength={8} />
    );

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "longpassword");
    await userEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(onRegister).toHaveBeenCalledWith("new@example.com", "longpassword");
    });
  });

  it("shows an error message when onSignIn rejects", async () => {
    const onSignIn = vi.fn().mockRejectedValue(new Error("Invalid credentials"));
    render(<LoginForm onSignIn={onSignIn} onRegister={noop} />);

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials");
    });
  });

  it("shows readable copy for a server error code, not axios's status line", async () => {
    const axiosErr = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { detail: "REGISTER_USER_ALREADY_EXISTS" } },
    });
    const onRegister = vi.fn().mockRejectedValue(axiosErr);
    render(<LoginForm onSignIn={noop} onRegister={onRegister} defaultTab="register" />);

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await userEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "An account with this email already exists. Sign in instead.",
      );
    });
  });

  it("clears error when switching tabs", async () => {
    const onSignIn = vi.fn().mockRejectedValue(new Error("Bad credentials"));
    render(<LoginForm onSignIn={onSignIn} onRegister={noop} />);

    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "pass");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("tab", { name: "Create Account" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows password length hint on register tab", () => {
    render(
      <LoginForm onSignIn={noop} onRegister={noop} defaultTab="register" passwordMinLength={12} />
    );
    expect(screen.getByText("At least 12 characters")).toBeInTheDocument();
  });

  it("renders Google sign-in button when onGoogleSignIn is provided", () => {
    const onGoogleSignIn = vi.fn();
    render(
      <LoginForm onSignIn={noop} onRegister={noop} onGoogleSignIn={onGoogleSignIn} />
    );
    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
  });

  it("keeps Create Account disabled while registerCaptchaReady is false", async () => {
    const { rerender } = render(
      <LoginForm onSignIn={noop} onRegister={noop} defaultTab="register" passwordMinLength={8} registerCaptchaReady={false} />
    );
    await userEvent.type(screen.getByLabelText("Password"), "longpassword");
    expect(screen.getByRole("button", { name: "Create Account" })).toBeDisabled();

    rerender(
      <LoginForm onSignIn={noop} onRegister={noop} defaultTab="register" passwordMinLength={8} registerCaptchaReady />
    );
    expect(screen.getByRole("button", { name: "Create Account" })).toBeEnabled();
  });

  it("does not render Google sign-in button when onGoogleSignIn is omitted", () => {
    render(<LoginForm onSignIn={noop} onRegister={noop} />);
    expect(screen.queryByText("Continue with Google")).toBeNull();
  });

  describe("with registerHref", () => {
    function renderWithLink(onSignIn = vi.fn().mockResolvedValue(undefined)) {
      render(
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route
              path="/login"
              element={<LoginForm onSignIn={onSignIn} registerHref="/register?returnTo=%2Fsettings" />}
            />
            <Route path="*" element={<CurrentPath />} />
          </Routes>
        </MemoryRouter>,
      );
      return onSignIn;
    }

    it("shows only the sign-in form, no Create Account tab", () => {
      renderWithLink();
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
      expect(screen.queryByRole("tab")).toBeNull();
      expect(screen.queryByRole("button", { name: "Create Account" })).toBeNull();
    });

    it("signs in from the form", async () => {
      const onSignIn = renderWithLink();
      await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
      await userEvent.type(screen.getByLabelText("Password"), "secret123");
      await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

      await waitFor(() => expect(onSignIn).toHaveBeenCalledWith("user@example.com", "secret123"));
    });

    it("links to the app's own sign-up page inside the router", async () => {
      renderWithLink();
      await userEvent.click(screen.getByRole("link", { name: "Create account" }));

      expect(await screen.findByTestId("current-path")).toHaveTextContent("/register?returnTo=%2Fsettings");
    });
  });

  it("leaves focus alone by default", () => {
    render(<LoginForm onSignIn={noop} onRegister={noop} />);
    expect(screen.getByLabelText("Email")).not.toHaveFocus();
  });

  it("focuses the email field with autoFocusEmail, but not again after a tab switch", async () => {
    render(<LoginForm onSignIn={noop} onRegister={noop} autoFocusEmail />);
    expect(screen.getByLabelText("Email")).toHaveFocus();

    await userEvent.click(screen.getByRole("tab", { name: "Create Account" }));
    expect(screen.getByLabelText("Email")).not.toHaveFocus();
  });

  it("takes exactly one way to sign up", () => {
    // @ts-expect-error -- neither onRegister nor registerHref
    void (<LoginForm onSignIn={noop} />);
    // @ts-expect-error -- both onRegister and registerHref
    void (<LoginForm onSignIn={noop} onRegister={noop} registerHref="/register" />);
    // @ts-expect-error -- the tab's captcha means nothing without the tab
    void (<LoginForm onSignIn={noop} registerHref="/register" registerCaptchaReady />);
  });
});
