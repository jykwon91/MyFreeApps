import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreenshotReader from "@/games/wow-forever/components/compare/ScreenshotReader";
import { itemReaderErrorMessage } from "@/games/wow-forever/lib/itemReaderErrorMessage";

const availability = vi.hoisted(() => ({ offered: true, siteKey: "site-key" }));
const extractItem = vi.hoisted(() => vi.fn());

vi.mock("@/games/wow-forever/lib/itemReaderAvailability", () => ({
  isScreenshotReaderOffered: () => availability.offered,
  turnstileSiteKey: () => availability.siteKey,
}));

vi.mock("@/games/wow-forever/api/wowItemsApi", () => ({
  useExtractItemMutation: () => [extractItem, { isLoading: false }],
}));

// Stand-in for the Cloudflare widget: a button that "passes" the check. Each
// mount counts, so a remount (fresh single-use token) is observable.
const widgetMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  const { useEffect } = await import("react");
  function FakeTurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
    useEffect(() => {
      widgetMounts.count += 1;
    }, []);
    return (
      <button type="button" onClick={() => onVerify(`tok-${widgetMounts.count}`)}>
        Pass human check
      </button>
    );
  }
  return { ...actual, TurnstileWidget: FakeTurnstileWidget };
});

const PNG = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "tooltip.png", { type: "image/png" });

function rejectWith(status: number, detail: string) {
  return { unwrap: () => Promise.reject({ status, data: { detail } }) };
}

async function chooseFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, PNG);
}

describe("WoW screenshot reader", () => {
  beforeEach(() => {
    availability.offered = true;
    availability.siteKey = "site-key";
    widgetMounts.count = 0;
    extractItem.mockReset();
  });

  it("is not offered on the public site without a Turnstile site key", () => {
    availability.offered = false;
    render(<ScreenshotReader onRead={vi.fn()} />);
    expect(screen.getByText(/isn't switched on for this site/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read screenshot" })).not.toBeInTheDocument();
  });

  it("waits for the human check, sends the token, then gets a fresh one", async () => {
    const response = { item: { name: "Blackstone Ring" } };
    extractItem.mockReturnValue({ unwrap: () => Promise.resolve(response) });
    const onRead = vi.fn();
    render(<ScreenshotReader onRead={onRead} />);

    await chooseFile();
    const readButton = screen.getByRole("button", { name: "Read screenshot" });
    expect(readButton).toBeDisabled();
    expect(screen.getByText(/complete the quick human check/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Pass human check" }));
    expect(readButton).toBeEnabled();
    await userEvent.click(readButton);

    expect(extractItem).toHaveBeenCalledWith({ image: PNG, turnstileToken: "tok-1" });
    expect(onRead).toHaveBeenCalledWith(response);
    // Tokens are single-use — the widget remounted for the next read.
    expect(widgetMounts.count).toBe(2);
  });

  it("points to manual entry when the daily budget is used up", async () => {
    extractItem.mockReturnValue(rejectWith(429, "item_reader_daily_limit_reached"));
    render(<ScreenshotReader onRead={vi.fn()} />);
    await chooseFile();
    await userEvent.click(screen.getByRole("button", { name: "Pass human check" }));
    await userEvent.click(screen.getByRole("button", { name: "Read screenshot" }));
    expect(await screen.findByText(/used up today's budget/i)).toBeInTheDocument();
    expect(screen.getByText(/enter the stats by hand instead/i)).toBeInTheDocument();
  });

  it("needs no human check when the bundle has no site key (local build)", async () => {
    availability.siteKey = "";
    extractItem.mockReturnValue({ unwrap: () => Promise.resolve({ item: {} }) });
    render(<ScreenshotReader onRead={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Pass human check" })).not.toBeInTheDocument();
    await chooseFile();
    await userEvent.click(screen.getByRole("button", { name: "Read screenshot" }));
    expect(extractItem).toHaveBeenCalledWith({ image: PNG, turnstileToken: undefined });
  });
});

describe("itemReaderErrorMessage", () => {
  it.each([
    ["item_reader_unavailable", /isn't switched on right now/],
    ["captcha_expired_please_retry", /expired/],
    ["Too many attempts", /in the last hour/],
  ])("maps %s to guidance", (detail, expected) => {
    expect(itemReaderErrorMessage({ status: 400, data: { detail } })).toMatch(expected);
  });

  it("passes through a readable server message", () => {
    const detail = "That doesn't look like a WoW item tooltip.";
    expect(itemReaderErrorMessage({ status: 422, data: { detail } })).toBe(detail);
  });
});
