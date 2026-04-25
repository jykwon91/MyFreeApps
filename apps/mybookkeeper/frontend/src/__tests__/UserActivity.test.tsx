import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import UserActivity from "@/admin/pages/UserActivity";

function renderPage() {
  return render(
    <BrowserRouter>
      <UserActivity />
    </BrowserRouter>
  );
}

describe("UserActivity (PostHog iframe page)", () => {
  const originalEnv = { ...import.meta.env };

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.assign(import.meta.env, originalEnv);
  });

  it("renders the page heading and subtitle", () => {
    vi.stubEnv("VITE_POSTHOG_DASHBOARD_URL", "https://us.posthog.com/embedded/abc123");
    renderPage();
    expect(screen.getByText("User Activity")).toBeInTheDocument();
    expect(screen.getByText(/Live product analytics via PostHog/i)).toBeInTheDocument();
  });

  it("renders an iframe pointing at the configured PostHog dashboard URL", () => {
    vi.stubEnv("VITE_POSTHOG_DASHBOARD_URL", "https://us.posthog.com/embedded/abc123");
    renderPage();
    const iframe = screen.getByTitle("PostHog User Activity Dashboard") as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toBe("https://us.posthog.com/embedded/abc123");
  });

  it("renders the empty state with setup instructions when env var is missing", () => {
    vi.stubEnv("VITE_POSTHOG_DASHBOARD_URL", "");
    renderPage();
    expect(screen.getByText(/PostHog dashboard not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_POSTHOG_DASHBOARD_URL/)).toBeInTheDocument();
    expect(screen.queryByTitle("PostHog User Activity Dashboard")).not.toBeInTheDocument();
  });

  it("empty state links to posthog.com", () => {
    vi.stubEnv("VITE_POSTHOG_DASHBOARD_URL", "");
    renderPage();
    const link = screen.getByRole("link", { name: /posthog\.com/i });
    expect(link).toHaveAttribute("href", "https://us.posthog.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
