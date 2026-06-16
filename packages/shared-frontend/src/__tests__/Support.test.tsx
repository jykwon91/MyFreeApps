import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Support from "../pages/Support";

// Stub the transparency widget with a sentinel so we can assert whether the
// page renders it (default) or omits it (showTransparency={false}). The widget's
// own fetch/render behaviour is covered by TransparencyWidget's tests.
vi.mock("../components/widgets/TransparencyWidget", () => ({
  default: () => <div data-testid="transparency-widget" />,
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
    expect(screen.getByRole("heading", { level: 1, name: /please support myfreeapps/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to mybookkeeper/i })).toBeInTheDocument();
  });

  it("shows a video placeholder when no video id is given", () => {
    renderSupport();
    expect(screen.getByText(/video coming soon/i)).toBeInTheDocument();
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

  it("renders a disabled 'coming soon' donate button when no Ko-fi url is set", () => {
    renderSupport();
    const cta = screen.getByRole("button", { name: /support on ko-fi/i });
    expect(cta).toBeDisabled();
    expect(screen.queryByRole("link", { name: /support on ko-fi/i })).not.toBeInTheDocument();
    expect(screen.getByText(/donations coming soon/i)).toBeInTheDocument();
  });

  it("renders the cost-transparency widget by default", () => {
    renderSupport();
    expect(screen.getByTestId("transparency-widget")).toBeInTheDocument();
  });

  it("omits the cost-transparency widget when showTransparency is false", () => {
    renderSupport({ showTransparency: false });
    expect(screen.queryByTestId("transparency-widget")).not.toBeInTheDocument();
  });
});
