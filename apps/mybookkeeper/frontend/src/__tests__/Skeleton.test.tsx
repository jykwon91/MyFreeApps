import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Skeleton from "@/shared/components/ui/Skeleton";

describe("Skeleton", () => {
  it("renders a pulsing placeholder with the given size classes", () => {
    const { container } = render(<Skeleton className="h-9 w-20" />);
    expect(container.firstElementChild).toHaveClass("animate-pulse", "h-9", "w-20");
  });

  it("exposes a test id only when one is given", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).not.toHaveAttribute("data-testid");
    render(<Skeleton testId="slot" />);
    expect(screen.getByTestId("slot")).toHaveClass("animate-pulse");
  });
});
