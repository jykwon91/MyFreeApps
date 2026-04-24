import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmptyState from "../components/ui/EmptyState";

describe("EmptyState — legacy API", () => {
  it("renders the message", () => {
    render(<EmptyState message="Nothing here yet" />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("does not render an action button when action is omitted", () => {
    render(<EmptyState message="No items" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the action button with the correct label", () => {
    render(
      <EmptyState
        message="No items"
        action={{ label: "Add one", onClick: () => {} }}
      />
    );
    expect(screen.getByText("Add one")).toBeInTheDocument();
  });

  it("calls action.onClick when the action button is clicked", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        message="No items"
        action={{ label: "Add one", onClick }}
      />
    );
    await userEvent.click(screen.getByText("Add one"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not render heading or body elements", () => {
    render(<EmptyState message="Empty" />);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
