/**
 * useHoverTooltip: `fitToViewport` caps the height, `interactive` is a keyboard-reachable popover
 * (Enter opens it with focus inside, Tab reaches its link, Escape returns focus, focus leaving closes it,
 * a mouse press on its link does not close it), and the default tooltip is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ITEM_TOOLTIP_HIDE_GRACE_MS, ITEM_TOOLTIP_SHOW_DELAY_MS } from "@/games/wow-forever/data/itemPages/itemTooltipConfig";
import { useHoverTooltip } from "@/games/wow-forever/hooks/useHoverTooltip";

interface HarnessProps {
  options?: Parameters<typeof useHoverTooltip>[0];
}

function Harness({ options }: HarnessProps) {
  const { open, tooltipId, triggerProps, floatingProps, setReference, setFloating, floatingStyles, isPositioned } = useHoverTooltip(options);
  return (
    <>
      <button type="button" ref={setReference} data-testid="trigger" aria-expanded={open} {...triggerProps}>
        Trigger
      </button>
      <button type="button">Before</button>
      {open ? (
        <div
          ref={setFloating}
          id={tooltipId}
          role={options?.interactive ? "dialog" : "tooltip"}
          aria-label="popover"
          data-testid="floating"
          style={{ ...floatingStyles, visibility: isPositioned ? "visible" : "hidden" }}
          {...floatingProps}
        >
          <a href="#inside">Inside link</a>
          <button type="button">Inside button</button>
        </div>
      ) : null}
      <button type="button">After</button>
    </>
  );
}

function trigger(): HTMLElement {
  return screen.getByTestId("trigger");
}

async function openWithKeyboard(): Promise<void> {
  const user = userEvent.setup();
  await user.tab();
  expect(trigger()).toHaveFocus();
  await user.keyboard("{Enter}");
  await screen.findByTestId("floating");
}

describe("useHoverTooltip fitToViewport", () => {
  it("caps the tooltip's height to the room on screen, and only when asked", async () => {
    const { unmount } = render(<Harness options={{ toggleOnTap: true, fitToViewport: true }} />);
    fireEvent.click(trigger());
    const capped = await screen.findByTestId("floating");
    await vi.waitFor(() => expect(capped.style.maxHeight).toMatch(/^\d+(\.\d+)?px$/));
    unmount();

    render(<Harness options={{ toggleOnTap: true }} />);
    fireEvent.click(trigger());
    const free = await screen.findByTestId("floating");
    await act(() => Promise.resolve());
    expect(free.style.maxHeight).toBe("");
  });
});

describe("a default (non-interactive) tooltip", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hides at once when the pointer leaves and describes its trigger", () => {
    render(<Harness />);
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_SHOW_DELAY_MS);
    });
    const floating = screen.getByTestId("floating");
    expect(trigger()).toHaveAttribute("aria-describedby", floating.id);
    expect(trigger()).not.toHaveAttribute("aria-controls");
    fireEvent.pointerLeave(trigger(), { pointerType: "mouse" });
    expect(screen.queryByTestId("floating")).not.toBeInTheDocument();
  });

  it("closes on blur", () => {
    render(<Harness />);
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_SHOW_DELAY_MS);
    });
    fireEvent.blur(trigger());
    expect(screen.queryByTestId("floating")).not.toBeInTheDocument();
  });
});

describe("an interactive popover", () => {
  const options = { toggleOnTap: true, interactive: true } as const;

  it("opens with Enter, moves focus into it, and the trigger controls it instead of being described by it", async () => {
    render(<Harness options={options} />);
    await openWithKeyboard();
    const floating = screen.getByTestId("floating");
    await vi.waitFor(() => expect(floating).toHaveFocus());
    expect(trigger()).toHaveAttribute("aria-controls", floating.id);
    expect(trigger()).not.toHaveAttribute("aria-describedby");
  });

  it("does not open on keyboard focus alone", async () => {
    render(<Harness options={options} />);
    await userEvent.setup().tab();
    expect(trigger()).toHaveFocus();
    expect(screen.queryByTestId("floating")).not.toBeInTheDocument();
  });

  it("lets Tab reach the link inside, and Escape closes it and returns focus to the trigger", async () => {
    render(<Harness options={options} />);
    await openWithKeyboard();
    await vi.waitFor(() => expect(screen.getByTestId("floating")).toHaveFocus());
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("link", { name: "Inside link" })).toHaveFocus();
    expect(screen.getByTestId("floating")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("floating")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes when Tab moves focus out past its last control", async () => {
    render(<Harness options={options} />);
    await openWithKeyboard();
    await vi.waitFor(() => expect(screen.getByTestId("floating")).toHaveFocus());
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Inside button" })).toHaveFocus();
    await user.tab();
    expect(screen.queryByTestId("floating")).not.toBeInTheDocument();
  });

  it("stays open when the trigger blurs onto the popover, as when the mouse presses its link", async () => {
    render(<Harness options={options} />);
    fireEvent.click(trigger());
    const floating = await screen.findByTestId("floating");
    fireEvent.blur(trigger(), { relatedTarget: screen.getByRole("link", { name: "Inside link" }) });
    expect(floating).toBeInTheDocument();
    fireEvent.blur(trigger(), { relatedTarget: screen.getByRole("button", { name: "After" }) });
    expect(screen.queryByTestId("floating")).not.toBeInTheDocument();
  });

  it("does not close while focus is inside it, however the mouse wanders", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Harness options={options} />);
      await openWithKeyboard();
      await vi.waitFor(() => expect(screen.getByTestId("floating")).toHaveFocus());
      fireEvent.pointerLeave(trigger(), { pointerType: "mouse" });
      fireEvent.pointerLeave(screen.getByTestId("floating"), { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(ITEM_TOOLTIP_HIDE_GRACE_MS * 3);
      });
      expect(screen.getByTestId("floating")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("an interactive popover with a mouse", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function hoverOpen(): void {
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_SHOW_DELAY_MS);
    });
  }

  it("uses one grace period for leaving the trigger and for leaving the popover", () => {
    render(<Harness options={{ interactive: true }} />);
    hoverOpen();
    fireEvent.pointerLeave(trigger(), { pointerType: "mouse" });
    fireEvent.pointerEnter(screen.getByTestId("floating"), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_HIDE_GRACE_MS * 2);
    });
    expect(screen.getByTestId("floating")).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByTestId("floating"), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_HIDE_GRACE_MS - 1);
    });
    expect(screen.getByTestId("floating")).toBeInTheDocument();
    // Back onto the trigger inside the grace period: no flicker.
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_HIDE_GRACE_MS * 2);
    });
    expect(screen.getByTestId("floating")).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByTestId("floating"), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(ITEM_TOOLTIP_HIDE_GRACE_MS);
    });
    expect(screen.queryByTestId("floating")).not.toBeInTheDocument();
  });
});
