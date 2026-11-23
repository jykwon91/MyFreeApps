import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DismissButton from "../components/ui/DismissButton";

describe("DismissButton", () => {
  it("is labelled Dismiss by default", () => {
    render(<DismissButton onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("uses a custom label", () => {
    render(<DismissButton onClick={() => {}} label="Close tip" />);
    expect(screen.getByRole("button", { name: "Close tip" })).toBeInTheDocument();
  });

  it("has a 44px touch target", () => {
    render(<DismissButton onClick={() => {}} />);
    expect(screen.getByRole("button")).toHaveClass("min-h-[44px]", "min-w-[44px]");
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<DismissButton onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
