import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocumentListEmptyState from "../DocumentListEmptyState";

// The real EmptyState is used on purpose: a stub would hide an icon rendered as literal text.
describe("DocumentListEmptyState", () => {
  it("draws the icon as an svg, never the icon's name as text", () => {
    const { container } = render(
      <DocumentListEmptyState kind="no-documents" forApplication={false} onClearFilter={vi.fn()} />,
    );

    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("FileText")).not.toBeInTheDocument();
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
  });

  it("offers Clear filter when nothing matches, with no icon text", async () => {
    const user = userEvent.setup();
    const onClearFilter = vi.fn();
    const { container } = render(
      <DocumentListEmptyState kind="no-matches" forApplication={false} onClearFilter={onClearFilter} />,
    );

    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("FileText")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });
});
