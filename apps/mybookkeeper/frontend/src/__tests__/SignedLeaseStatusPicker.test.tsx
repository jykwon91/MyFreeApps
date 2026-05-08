/**
 * Unit tests for ``SignedLeaseStatusPicker``.
 *
 * Covers:
 * - Renders as a plain badge (no dropdown trigger) when the current status
 *   has no valid next states (``ended`` / ``terminated``).
 * - Renders as a plain badge when ``disabled=true``.
 * - Renders as a click-to-open trigger when next states exist.
 * - Opening the menu shows exactly the allowed next states from the
 *   ``SIGNED_LEASE_STATUS_NEXT`` map.
 * - Picking a state calls ``onChange`` with the picked value.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import SignedLeaseStatusPicker from "@/app/features/leases/SignedLeaseStatusPicker";

describe("SignedLeaseStatusPicker", () => {
  it("renders as a plain badge for terminal statuses (ended)", () => {
    const onChange = vi.fn();
    render(<SignedLeaseStatusPicker status="ended" onChange={onChange} />);
    expect(screen.queryByTestId("signed-lease-status-picker-trigger")).toBeNull();
    expect(screen.getByTestId("signed-lease-status-badge-ended")).toBeInTheDocument();
  });

  it("renders as a plain badge when disabled", () => {
    const onChange = vi.fn();
    render(
      <SignedLeaseStatusPicker
        status="generated"
        onChange={onChange}
        disabled
      />,
    );
    expect(screen.queryByTestId("signed-lease-status-picker-trigger")).toBeNull();
    expect(
      screen.getByTestId("signed-lease-status-badge-generated"),
    ).toBeInTheDocument();
  });

  it("renders an interactive trigger when next states exist", () => {
    const onChange = vi.fn();
    render(<SignedLeaseStatusPicker status="generated" onChange={onChange} />);
    const trigger = screen.getByTestId("signed-lease-status-picker-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-label", "Change status from Generated");
  });

  it("opens menu showing only the allowed next states for 'generated'", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SignedLeaseStatusPicker status="generated" onChange={onChange} />);
    await user.click(screen.getByTestId("signed-lease-status-picker-trigger"));
    // Generated -> Sent or Signed (per SIGNED_LEASE_STATUS_NEXT)
    expect(
      screen.getByTestId("signed-lease-status-picker-option-sent"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("signed-lease-status-picker-option-signed"),
    ).toBeInTheDocument();
    // Current status is not in the menu
    expect(
      screen.queryByTestId("signed-lease-status-picker-option-generated"),
    ).toBeNull();
    // Disallowed transitions are not in the menu
    expect(
      screen.queryByTestId("signed-lease-status-picker-option-active"),
    ).toBeNull();
    expect(
      screen.queryByTestId("signed-lease-status-picker-option-draft"),
    ).toBeNull();
  });

  it("opens menu showing 'active' as the only next state from 'signed'", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SignedLeaseStatusPicker status="signed" onChange={onChange} />);
    await user.click(screen.getByTestId("signed-lease-status-picker-trigger"));
    expect(
      screen.getByTestId("signed-lease-status-picker-option-active"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("signed-lease-status-picker-option-signed"),
    ).toBeNull();
  });

  it("calls onChange with the picked status", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SignedLeaseStatusPicker status="generated" onChange={onChange} />);
    await user.click(screen.getByTestId("signed-lease-status-picker-trigger"));
    await user.click(
      screen.getByTestId("signed-lease-status-picker-option-signed"),
    );
    expect(onChange).toHaveBeenCalledWith("signed");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
