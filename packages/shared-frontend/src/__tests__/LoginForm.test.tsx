import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "../components/auth/LoginForm";

function noop() {
  return Promise.resolve();
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

  it("does not render Google sign-in button when onGoogleSignIn is omitted", () => {
    render(<LoginForm onSignIn={noop} onRegister={noop} />);
    expect(screen.queryByText("Continue with Google")).toBeNull();
  });
});
