import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DismissReasonPopover from "../DismissReasonPopover";

describe("DismissReasonPopover", () => {
  it("renders all reason buttons", () => {
    render(
      <DismissReasonPopover
        onDismiss={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />,
    );
    expect(screen.getByText("Wrong tech stack")).toBeInTheDocument();
    expect(screen.getByText("Not interested")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("calls onDismiss with the correct reason when a reason button is clicked", async () => {
    const onDismiss = vi.fn();
    render(
      <DismissReasonPopover
        onDismiss={onDismiss}
        onCancel={vi.fn()}
        isLoading={false}
      />,
    );
    await userEvent.click(screen.getByText("Wrong tech stack"));
    expect(onDismiss).toHaveBeenCalledWith("wrong_stack");
  });

  it("calls onDismiss with no argument when skip is clicked", async () => {
    const onDismiss = vi.fn();
    render(
      <DismissReasonPopover
        onDismiss={onDismiss}
        onCancel={vi.fn()}
        isLoading={false}
      />,
    );
    await userEvent.click(screen.getByText(/dismiss without a reason/i));
    expect(onDismiss).toHaveBeenCalledWith();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <DismissReasonPopover
        onDismiss={vi.fn()}
        onCancel={onCancel}
        isLoading={false}
      />,
    );
    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables reason buttons and skip when isLoading is true", () => {
    render(
      <DismissReasonPopover
        onDismiss={vi.fn()}
        onCancel={vi.fn()}
        isLoading={true}
      />,
    );
    expect(screen.getByText("Wrong tech stack")).toBeDisabled();
    expect(screen.getByText(/dismiss without a reason/i)).toBeDisabled();
  });
});
