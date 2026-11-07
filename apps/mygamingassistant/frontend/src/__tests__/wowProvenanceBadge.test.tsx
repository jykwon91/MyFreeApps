import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import ProvenanceGuide from "@/games/wow-forever/components/shared/ProvenanceGuide";
import {
  PROVENANCE_BADGE_HINT,
  PROVENANCE_DESCRIPTION,
  PROVENANCE_DETAIL,
  PROVENANCE_GUIDE,
  PROVENANCE_LABEL,
  PROVENANCE_ORDER,
} from "@/games/wow-forever/data/provenance/provenanceLabels";
import { ITEM_TOOLTIP_SHOW_DELAY_MS } from "@/games/wow-forever/data/itemPages/itemTooltipConfig";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** jsdom has no focus-visible heuristic, so play the browser: keyboard focus matches it, a click or tap doesn't. */
function stubFocusVisible(matches: boolean) {
  const original = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":focus-visible" ? matches : original.call(this, selector);
  });
}

function tap(el: HTMLElement) {
  fireEvent.pointerDown(el, { pointerType: "touch" });
  fireEvent.click(el);
}

const tooltip = () => screen.queryByTestId("provenance-tooltip");

describe("ProvenanceBadge", () => {
  beforeEach(() => stubFocusVisible(false));
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the label as a button with no tooltip until asked", () => {
    render(<ProvenanceBadge provenance={PROVENANCE.classic} />);
    const badge = screen.getByTestId("provenance-badge");
    expect(badge.tagName).toBe("BUTTON");
    expect(badge).toHaveAttribute("data-provenance", "classic");
    expect(badge).toHaveTextContent(PROVENANCE_LABEL.classic);
    expect(badge).toHaveAttribute("aria-expanded", "false");
    expect(tooltip()).not.toBeInTheDocument();
  });

  it("a tap opens the explanation with its detail, a second tap closes it", () => {
    render(<ProvenanceBadge provenance={PROVENANCE.unconfirmed} detail={PROVENANCE_DETAIL.betaReport} />);
    const badge = screen.getByTestId("provenance-badge");

    tap(badge);
    const tip = screen.getByTestId("provenance-tooltip");
    expect(within(tip).getByText(PROVENANCE_DESCRIPTION.unconfirmed)).toBeInTheDocument();
    expect(within(tip).getByText(PROVENANCE_DETAIL.betaReport)).toBeInTheDocument();
    expect(badge).toHaveAttribute("aria-expanded", "true");
    expect(badge).toHaveAttribute("aria-describedby", tip.id);

    tap(badge);
    expect(tooltip()).not.toBeInTheDocument();
  });

  it("a tap anywhere else closes it", () => {
    render(
      <div>
        <ProvenanceBadge provenance={PROVENANCE.client} />
        <p>elsewhere</p>
      </div>,
    );
    tap(screen.getByTestId("provenance-badge"));
    expect(tooltip()).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText("elsewhere"), { pointerType: "touch" });
    expect(tooltip()).not.toBeInTheDocument();
  });

  it("a mouse hover opens it after the delay, a click keeps it open, leaving closes it", () => {
    vi.useFakeTimers();
    render(<ProvenanceBadge provenance={PROVENANCE.published} />);
    const badge = screen.getByTestId("provenance-badge");

    fireEvent.pointerEnter(badge, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(ITEM_TOOLTIP_SHOW_DELAY_MS));
    expect(tooltip()).toBeInTheDocument();

    fireEvent.pointerDown(badge, { pointerType: "mouse" });
    fireEvent.click(badge);
    expect(tooltip()).toBeInTheDocument();

    fireEvent.pointerLeave(badge, { pointerType: "mouse" });
    expect(tooltip()).not.toBeInTheDocument();
  });

  it("keyboard focus opens it and Escape closes it", async () => {
    vi.restoreAllMocks();
    stubFocusVisible(true);
    const user = userEvent.setup();
    render(<ProvenanceBadge provenance={PROVENANCE.classic} />);

    await user.tab();
    expect(tooltip()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(tooltip()).not.toBeInTheDocument();
  });

  it("Seen in game shows its date in the chip and the accessible name", () => {
    render(<ProvenanceBadge provenance={PROVENANCE.seen} date="11/5/2026" />);
    const badge = screen.getByTestId("provenance-badge");
    expect(badge).toHaveTextContent(`${PROVENANCE_LABEL.seen} 11/5/2026`);
    expect(badge).toHaveAccessibleName(`${PROVENANCE_LABEL.seen} 11/5/2026${PROVENANCE_BADGE_HINT}`);
  });

  it("is never found as a form field's label (\"Classic data\" contains \"Class\")", () => {
    render(<ProvenanceBadge provenance={PROVENANCE.classic} />);
    expect(screen.queryByLabelText(/Class/)).not.toBeInTheDocument();
  });
});

describe("ProvenanceGuide", () => {
  it("explains every tag in order and what an untagged row means", () => {
    render(<ProvenanceGuide />);
    const guide = screen.getByTestId("provenance-guide");
    expect(within(guide).getByText(PROVENANCE_GUIDE.title)).toBeInTheDocument();
    const terms = within(guide).getAllByRole("term").map((t) => t.textContent);
    expect(terms).toEqual(PROVENANCE_ORDER.map((p) => PROVENANCE_LABEL[p]));
    for (const p of PROVENANCE_ORDER) expect(within(guide).getByText(PROVENANCE_DESCRIPTION[p])).toBeInTheDocument();
    expect(within(guide).getByText(PROVENANCE_GUIDE.untagged)).toBeInTheDocument();
  });
});
