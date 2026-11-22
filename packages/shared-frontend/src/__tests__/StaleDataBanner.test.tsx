import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StaleDataBanner from "../components/ui/StaleDataBanner";

describe("StaleDataBanner", () => {
  it("announces its message as a status", () => {
    render(<StaleDataBanner message="Showing what loaded last." />);

    expect(screen.getByRole("status")).toHaveTextContent("Showing what loaded last.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers a retry button that runs onRetry", () => {
    const onRetry = vi.fn();
    render(<StaleDataBanner message="Stale." onRetry={onRetry} retryLabel="Try again" />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows no button without a retry handler and label", () => {
    render(<StaleDataBanner message="Stale." retryLabel="Try again" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("passes a class name to the box", () => {
    const { container } = render(<StaleDataBanner message="Stale." className="mb-4" />);
    expect(container.firstElementChild).toHaveClass("mb-4");
  });
});
