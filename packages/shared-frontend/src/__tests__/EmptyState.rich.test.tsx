import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmptyState from "../components/ui/EmptyState";

describe("EmptyState — rich API", () => {
  it("renders heading and body", () => {
    render(<EmptyState heading="No applications" body="Start by adding your first job." />);
    expect(screen.getByRole("heading", { name: "No applications" })).toBeInTheDocument();
    expect(screen.getByText("Start by adding your first job.")).toBeInTheDocument();
  });

  it("renders the icon slot when provided", () => {
    render(
      <EmptyState
        heading="Empty"
        body="Nothing here"
        icon={<span data-testid="custom-icon">icon</span>}
      />
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("does not render the icon container when icon is omitted", () => {
    render(<EmptyState heading="Empty" body="Nothing here" />);
    expect(screen.queryByTestId("custom-icon")).toBeNull();
  });

  it("renders a button with the action label", () => {
    render(
      <EmptyState
        heading="No items"
        body="Add one to get started"
        action={{ label: "Add item", onClick: () => {} }}
      />
    );
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it("calls action.onClick when the action button is clicked", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        heading="No items"
        body="Add one to get started"
        action={{ label: "Add item", onClick }}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders action button in loading state when loading=true", () => {
    render(
      <EmptyState
        heading="No items"
        body="Add one to get started"
        action={{ label: "Add item", onClick: () => {}, loading: true }}
      />
    );
    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
  });

  it("does not render an action button when action is omitted", () => {
    render(<EmptyState heading="Empty" body="Nothing here" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
