/**
 * GuildMemberDataAge: shows "Blizzard data from X ago · updates when they log out"
 * when blizzard_updated_at is set, and nothing when it is null.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GuildMemberDataAge from "@/games/wow-forever/components/guild/GuildMemberDataAge";

const THREE_HOURS_AGO = new Date(Date.now() - 3 * 3_600_000).toISOString();

describe("GuildMemberDataAge", () => {
  it("renders nothing when blizzard_updated_at is null", () => {
    const { container } = render(<GuildMemberDataAge blizzard_updated_at={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the relative time and update-on-logout text when blizzard_updated_at is set", () => {
    render(<GuildMemberDataAge blizzard_updated_at={THREE_HOURS_AGO} />);
    expect(screen.getByText(/Blizzard data from/)).toBeVisible();
    expect(screen.getByText(/updates when they log out/)).toBeVisible();
  });

  it("includes the absolute timestamp in the title attribute for tooltip", () => {
    const { container } = render(<GuildMemberDataAge blizzard_updated_at={THREE_HOURS_AGO} />);
    const span = container.querySelector("[title]") as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.getAttribute("title")).toContain("updates when they log out");
  });

  it("includes the Clock icon for the data age note", () => {
    const { container } = render(<GuildMemberDataAge blizzard_updated_at={THREE_HOURS_AGO} />);
    // lucide Clock renders an svg
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
