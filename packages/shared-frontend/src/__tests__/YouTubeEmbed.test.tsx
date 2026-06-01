import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import YouTubeEmbed from "../components/embed/YouTubeEmbed";

describe("YouTubeEmbed", () => {
  it("renders a privacy-friendly nocookie iframe when a videoId is provided", () => {
    const { container } = render(<YouTubeEmbed videoId="abc123" title="My video" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("youtube-nocookie.com/embed/abc123");
    expect(iframe?.getAttribute("title")).toBe("My video");
  });

  it("shows a placeholder and no iframe when videoId is missing", () => {
    const { container } = render(<YouTubeEmbed />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
