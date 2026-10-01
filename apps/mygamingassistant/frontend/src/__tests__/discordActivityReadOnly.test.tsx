/**
 * The Discord Activity is browse-only (lib/readOnly.ts). Each test loads the
 * page the way Discord launches an Activity — with its launch parameters
 * (?frame_id=…) — or the way the website loads, and uses the REAL
 * inside-Discord detection. Inside Discord the write surfaces step aside and
 * point to the website; outside Discord nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { __resetDiscordLaunchForTests } from "@platform/ui/discord-activity/launchParams";
import GlanceBoardOperatorMenu from "@/components/lineup/GlanceBoardOperatorMenu";
import ItemInputPanel from "@/games/wow-forever/components/compare/ItemInputPanel";
import { isReadOnly } from "@/lib/readOnly";

vi.mock("@/games/wow-forever/api/wowItemsApi", () => ({
  useExtractItemMutation: () => [vi.fn(), { isLoading: false }],
}));

const LAUNCH_QUERY = "?frame_id=frame-1&instance_id=instance-1&platform=desktop";
const COMPARE_PATH = "/wow-forever/compare";

/** A fresh page load at `url`: inside/outside Discord is worked out again. */
function loadPage(url: string): void {
  window.history.replaceState(null, "", url);
  __resetDiscordLaunchForTests();
}

function renderItemInput(url: string): void {
  loadPage(url);
  render(
    <MemoryRouter initialEntries={[url]}>
      <ItemInputPanel itemLabel="Item A" onTextRead={vi.fn()} onScreenshotRead={vi.fn()} />
    </MemoryRouter>,
  );
}

function renderMapMenu(url: string, unplaceableCount: number): void {
  loadPage(url);
  render(
    <MemoryRouter initialEntries={[url]}>
      <GlanceBoardOperatorMenu
        gameSlug="cs2"
        mapSlug="mirage"
        isSuperuser={false}
        unplaceableCount={unplaceableCount}
        onReplaceMinimapClick={vi.fn()}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
  loadPage("/");
});

describe("read-only sessions", () => {
  it("the Discord Activity is read-only", () => {
    loadPage(`/${LAUNCH_QUERY}`);
    expect(isReadOnly()).toBe(true);
  });

  it("stays read-only after a reload on a page without the launch parameters", () => {
    loadPage(`/${LAUNCH_QUERY}`);
    expect(isReadOnly()).toBe(true);
    loadPage("/cs2/mirage");
    expect(isReadOnly()).toBe(true);
  });

  it("the website is not (full-auth build)", () => {
    loadPage("/");
    expect(isReadOnly()).toBe(false);
  });

  it("a serve-only build is", () => {
    vi.stubEnv("VITE_SERVE_ONLY", "true");
    loadPage("/");
    expect(isReadOnly()).toBe(true);
  });
});

describe("WoW item compare", () => {
  it("starts on pasting text inside Discord", () => {
    renderItemInput(`${COMPARE_PATH}${LAUNCH_QUERY}`);
    expect(screen.getByRole("radio", { name: "Paste from a website" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("explains inside Discord that reading screenshots works in the browser", async () => {
    renderItemInput(`${COMPARE_PATH}${LAUNCH_QUERY}`);
    await userEvent.click(screen.getByRole("radio", { name: "Screenshot" }));
    expect(screen.getByText(/reading screenshots works in the browser/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read screenshot" })).not.toBeInTheDocument();
  });

  it("opens the same page on the real site, without Discord's launch parameters", async () => {
    // Discord isn't connected in this test, so openExternal takes its new-tab
    // fallback; the Discord route is covered by shared-frontend's
    // discordOpenExternal tests against the real SDK.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderItemInput(`${COMPARE_PATH}${LAUNCH_QUERY}`);
    await userEvent.click(screen.getByRole("radio", { name: "Screenshot" }));
    await userEvent.click(screen.getByRole("button", { name: "Open in browser" }));
    await vi.waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://mygamingassistant.myfreeapps.org/wow-forever/compare",
        "_blank",
        "noopener,noreferrer",
      ),
    );
  });

  it("starts on the screenshot reader on the website", () => {
    renderItemInput(COMPARE_PATH);
    expect(screen.getByRole("radio", { name: "Screenshot" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Read screenshot" })).toBeInTheDocument();
  });
});

describe("map actions menu", () => {
  it("has nothing to offer a visitor inside Discord", () => {
    renderMapMenu(`/cs2/mirage${LAUNCH_QUERY}`, 0);
    expect(screen.queryByRole("button", { name: "Map actions" })).not.toBeInTheDocument();
  });

  it("keeps the unplaceable-lineups notice inside Discord, without Add lineup", async () => {
    renderMapMenu(`/cs2/mirage${LAUNCH_QUERY}`, 2);
    await userEvent.click(screen.getByRole("button", { name: "Map actions" }));
    expect(screen.getByText("2 lineups can't be placed on the minimap")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Add lineup" })).not.toBeInTheDocument();
  });

  it("still offers Add lineup on the website", async () => {
    renderMapMenu("/cs2/mirage", 0);
    await userEvent.click(screen.getByRole("button", { name: "Map actions" }));
    expect(screen.getByRole("menuitem", { name: "Add lineup" })).toHaveAttribute(
      "href",
      "/lineups/new?game=cs2&map=mirage",
    );
  });
});
