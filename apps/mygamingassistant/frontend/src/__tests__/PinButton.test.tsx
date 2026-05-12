/**
 * Unit tests for PinButton.
 *
 * Coverage:
 *  - Renders with accessible aria-label when not pinned
 *  - Renders with accessible aria-label when pinned
 *  - Calls onToggle when clicked
 *  - aria-pressed reflects pinned state
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PinButton from "@/components/lineup/PinButton";

describe("PinButton", () => {
  it("shows 'Pin lineup' label when not pinned", () => {
    render(<PinButton isPinned={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Pin lineup" })).toBeDefined();
  });

  it("shows 'Unpin lineup' label when pinned", () => {
    render(<PinButton isPinned={true} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Unpin lineup" })).toBeDefined();
  });

  it("aria-pressed is false when not pinned", () => {
    render(<PinButton isPinned={false} onToggle={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("aria-pressed is true when pinned", () => {
    render(<PinButton isPinned={true} onToggle={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<PinButton isPinned={false} onToggle={onToggle} />);
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
