/**
 * Unit tests for CreateDemoDialog.
 *
 * Verifies:
 *   - Submit with all fields blank calls onSubmit with `{ }` (defaults
 *     resolved server-side).
 *   - Submit after typing values passes the trimmed strings.
 *   - Cancel button calls onCancel.
 *   - Inputs are disabled while loading.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateDemoDialog from "../CreateDemoDialog";

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    LoadingButton: ({
      children,
      isLoading,
      loadingText,
      type,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      loadingText?: string;
      type?: "button" | "submit" | "reset";
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      disabled?: boolean;
    }) => (
      <button
        type={type ?? "button"}
        disabled={disabled || isLoading}
        onClick={onClick}
      >
        {isLoading ? loadingText : children}
      </button>
    ),
  };
});

describe("CreateDemoDialog", () => {
  it("submits empty payload when both fields are blank", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <CreateDemoDialog
        open
        isLoading={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      email: undefined,
      displayName: undefined,
    });
  });

  it("submits trimmed values when fields are populated", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CreateDemoDialog
        open
        isLoading={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText(/email/i),
      "  demo@myjobhunter.local  ",
    );
    await user.type(screen.getByLabelText(/display name/i), "  Demo Boss  ");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "demo@myjobhunter.local",
      displayName: "Demo Boss",
    });
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <CreateDemoDialog
        open
        isLoading={false}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables inputs while loading", () => {
    render(
      <CreateDemoDialog
        open
        isLoading
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/display name/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });
});
