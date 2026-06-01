import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Support from "../pages/Support";

// The transparency widget self-fetches; stub it as "not configured" so it
// renders nothing and the page layout is exercised cleanly.
vi.mock("../components/widgets/useTransparency", () => ({
  useTransparency: () => ({
    status: "ok",
    data: { month: "June 2026", costs_cents: 0, donations_cents: 0, updated_at: null, configured: false },
  }),
}));

function renderSupport(props: Partial<Parameters<typeof Support>[0]> = {}) {
  return render(
    <MemoryRouter>
      <Support appName="MyBookkeeper" {...props} />
    </MemoryRouter>,
  );
}

describe("Support page", () => {
  it("renders the heading and a back link to the host app", () => {
    renderSupport();
    expect(screen.getByRole("heading", { level: 1, name: /why myfreeapps is free/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to mybookkeeper/i })).toBeInTheDocument();
  });

  it("shows a video placeholder when no video id is given", () => {
    renderSupport();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("embeds the video when an id is provided", () => {
    const { container } = renderSupport({ youtubeVideoId: "xyz" });
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain(
      "youtube-nocookie.com/embed/xyz",
    );
  });

  it("links the donate CTA to the provided Ko-fi url", () => {
    renderSupport({ kofiUrl: "https://ko-fi.com/test" });
    expect(screen.getByRole("link", { name: /support on ko-fi/i })).toHaveAttribute(
      "href",
      "https://ko-fi.com/test",
    );
  });
});
