import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DocumentsSkeleton from "@/app/features/documents/DocumentsSkeleton";

describe("DocumentsSkeleton", () => {
  it("shows phone cards below md and the table from md up, like DocumentTable", () => {
    const { container } = render(<DocumentsSkeleton />);
    const cards = screen.getAllByTestId("document-card-skeleton");
    expect(cards).toHaveLength(10);
    expect(cards[0].parentElement).toHaveClass("md:hidden");
    const table = container.querySelector("table");
    expect(table?.parentElement).toHaveClass("hidden", "md:block");
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(10);
  });
});
