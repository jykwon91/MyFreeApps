import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../components/ui/ConfirmDialog";

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const defaults = {
    open: true,
    title: "Confirm action?",
    description: "This action cannot be undone.",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(<ConfirmDialog {...defaults} {...overrides} />);
}

describe("ConfirmDialog — rendering", () => {
  it("renders the title and description", () => {
    renderDialog();
    expect(screen.getByText("Confirm action?")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("renders default confirmLabel 'Confirm' and cancelLabel 'Cancel'", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders custom confirmLabel and cancelLabel", () => {
    renderDialog({ confirmLabel: "Delete", cancelLabel: "Keep" });
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("renders ReactNode description", () => {
    renderDialog({ description: <span data-testid="rich-desc">Rich content</span> });
    expect(screen.getByTestId("rich-desc")).toBeInTheDocument();
  });

  it("renders children inside the dialog", () => {
    renderDialog({ children: <input data-testid="extra-input" /> });
    expect(screen.getByTestId("extra-input")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Confirm action?")).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog — callbacks", () => {
  it("calls onConfirm when the confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", async () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the dialog overlay is dismissed (Escape key)", async () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmDialog — Promise onConfirm loading state", () => {
  it("shows 'Processing...' while the Promise is pending", async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    renderDialog({ onConfirm });

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    // Button should now show loading text
    expect(screen.getByText("Processing...")).toBeInTheDocument();

    // Resolve the promise
    resolve();
    await waitFor(() => {
      expect(screen.queryByText("Processing...")).not.toBeInTheDocument();
    });
  });

  it("disables the confirm and cancel buttons while Promise is pending", async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    renderDialog({ onConfirm });

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolve();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();
    });
  });

  it("restores button after the Promise rejects", async () => {
    // The component suppresses the unhandled rejection internally and resets
    // loading state regardless of whether the Promise resolved or rejected.
    let reject!: () => void;
    const onConfirm = vi.fn(
      () => new Promise<void>((_, r) => { reject = () => r(new Error("oops")); }),
    );
    renderDialog({ onConfirm });

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByText("Processing...")).toBeInTheDocument();

    reject();
    await waitFor(() => {
      expect(screen.queryByText("Processing...")).not.toBeInTheDocument();
    });
  });
});

describe("ConfirmDialog — external isLoading prop", () => {
  it("shows 'Processing...' when isLoading=true", () => {
    renderDialog({ isLoading: true });
    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it("disables the cancel button when isLoading=true", () => {
    renderDialog({ isLoading: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

describe("ConfirmDialog — variant styling", () => {
  it("applies destructive styling when variant='danger'", () => {
    renderDialog({ variant: "danger", confirmLabel: "Delete" });
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-red-600");
  });

  it("applies destructive styling when variant='destructive'", () => {
    renderDialog({ variant: "destructive", confirmLabel: "Delete" });
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-red-600");
  });

  it("applies primary styling when variant='default'", () => {
    renderDialog({ variant: "default" });
    const btn = screen.getByRole("button", { name: "Confirm" });
    expect(btn.className).toContain("bg-primary");
  });
});
