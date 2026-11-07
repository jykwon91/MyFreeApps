import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WHATS_NEW } from "@/games/wow-forever/data/whatsNew";
import { WHATS_NEW_HUB_COUNT } from "@/games/wow-forever/data/whatsNewSettings";

// The live server-status poll has its own tests; keep this one off the network.
vi.mock("@/games/wow-forever/components/serverStatus/WowServerStatusSection", () => ({
  default: () => <section aria-label="WoW Forever server status" />,
}));

// Gear has something new since the last visit; nothing else does.
vi.mock("@/games/wow-forever/hooks/useUpdateDots", () => ({
  useUpdateDots: () => new Set(["/wow-forever/gear"]),
}));

import WowForeverLanding from "@/games/wow-forever/pages/WowForeverLanding";

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/wow-forever"]}>
      <WowForeverLanding />
    </MemoryRouter>,
  );
}

describe("WoW Forever hub", () => {
  it("shows which client build the data comes from", () => {
    renderHub();
    expect(screen.getByTestId("wow-data-refresh")).toHaveTextContent(
      /^Game data: patch \d+\.\d+\.\d+ \(build \d+\) · updated [A-Z][a-z]{2} \d{1,2}, \d{4}$/,
    );
  });

  it("lists the latest changes, and Show all reveals the rest", () => {
    renderHub();
    const section = screen.getByRole("region", { name: "What’s new on this site" });
    expect(within(section).getAllByRole("listitem")).toHaveLength(WHATS_NEW_HUB_COUNT);
    expect(within(section).getByRole("link", { name: new RegExp(WHATS_NEW[0].title) })).toHaveAttribute(
      "href",
      WHATS_NEW[0].to,
    );
    const toggle = within(section).getByRole("button", { name: `Show all (${WHATS_NEW.length})` });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(section).getAllByRole("listitem")).toHaveLength(WHATS_NEW.length);
    fireEvent.click(within(section).getByRole("button", { name: "Show fewer" }));
    expect(within(section).getAllByRole("listitem")).toHaveLength(WHATS_NEW_HUB_COUNT);
  });

  it("dots only the tile with something new", () => {
    renderHub();
    const dots = screen.getAllByTestId("update-dot");
    expect(dots).toHaveLength(1);
    expect(dots[0].closest("a")).toHaveAttribute("href", "/wow-forever/gear");
    expect(screen.getByRole("link", { name: /Best gear\s*new since your last visit/ })).toBeInTheDocument();
  });

  it("gives every tile its left-nav icon", () => {
    const { container } = renderHub();
    const tiles = container.querySelectorAll('.grid a[href^="/wow-forever/"]');
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((tile) => expect(tile.querySelector("svg")).not.toBeNull());
  });
});
