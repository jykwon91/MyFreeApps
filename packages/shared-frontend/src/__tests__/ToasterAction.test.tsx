import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Toaster from "../components/ui/Toaster";
import { showError, showSuccess } from "../lib/toast-store";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Toaster actions", () => {
  it("shows a toast without an action as before, with no extra button", () => {
    render(<Toaster />);
    act(() => showSuccess("Saved"));

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("keeps the toast open and the button busy while the action runs, then closes it", async () => {
    const pending = deferred();
    const onClick = vi.fn(() => pending.promise);
    render(<Toaster />);
    act(() => showSuccess("Dismissed.", { label: "Undo", pendingLabel: "Undoing…", altText: "Undo dismiss", onClick }));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    const busy = screen.getByRole("button", { name: "Undoing…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Dismissed.")).toBeInTheDocument();
    fireEvent.click(busy);
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.queryByText("Dismissed.")).toBeNull());
  });

  it("closes the toast after an action that returns nothing", async () => {
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => showError("Couldn't send", { label: "Retry", altText: "Send again", onClick }));

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("Couldn't send")).toBeNull());
  });

  it("closes the toast and logs, with no unhandled rejection, when the action rejects", async () => {
    const failure = new Error("undo failed");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      render(<Toaster />);
      act(() => showSuccess("Dismissed.", { label: "Undo", altText: "Undo dismiss", onClick: () => Promise.reject(failure) }));

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));

      await waitFor(() => expect(screen.queryByText("Dismissed.")).toBeNull());
      expect(logged).toHaveBeenCalledWith("[Toaster] toast action failed", failure);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      logged.mockRestore();
    }
  });
});
