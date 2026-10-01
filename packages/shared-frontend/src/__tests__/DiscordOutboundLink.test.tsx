import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OutboundLink from "../discord-activity/OutboundLink";
import { LAUNCH_QUERY, loadPage } from "./discordTestUtils";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => Promise<void>>(async () => undefined),
}));

vi.mock("../discord-activity/openExternal", () => ({ openExternal: mocks.openExternal }));

const HREF = "https://www.curseforge.com/wow/addons/questie";

/**
 * Click `element`; report whether the click's default action (following the
 * link) was cancelled. A window listener runs after React's handlers, records
 * the outcome, then cancels the navigation jsdom can't perform.
 */
function clickWasPrevented(element: HTMLElement): boolean {
  let prevented = false;
  function record(event: Event): void {
    prevented = event.defaultPrevented;
    event.preventDefault();
  }
  window.addEventListener("click", record);
  try {
    fireEvent.click(element);
  } finally {
    window.removeEventListener("click", record);
  }
  return prevented;
}

beforeEach(() => {
  sessionStorage.clear();
  loadPage("/");
  mocks.openExternal.mockClear();
});

afterEach(() => {
  sessionStorage.clear();
  loadPage("/");
});

describe("OutboundLink", () => {
  it("is a plain new-tab link on the website", () => {
    render(
      <OutboundLink href={HREF} className="underline" aria-label="Questie on CurseForge">
        Questie
      </OutboundLink>,
    );
    const link = screen.getByRole("link", { name: "Questie on CurseForge" });
    expect(link).toHaveAttribute("href", HREF);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveClass("underline");

    expect(clickWasPrevented(link)).toBe(false);
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it("goes through Discord inside an Activity", () => {
    loadPage(`/${LAUNCH_QUERY}`);
    render(<OutboundLink href={HREF}>Questie</OutboundLink>);

    expect(clickWasPrevented(screen.getByRole("link", { name: "Questie" }))).toBe(true);
    expect(mocks.openExternal).toHaveBeenCalledWith(HREF);
  });

  it("runs the caller's onClick, and lets it cancel the link", () => {
    loadPage(`/${LAUNCH_QUERY}`);
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    render(
      <OutboundLink href={HREF} onClick={onClick}>
        Questie
      </OutboundLink>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Questie" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
});
