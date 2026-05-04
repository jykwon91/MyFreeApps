import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import GmailReauthSidebarBanner from "@/app/components/GmailReauthSidebarBanner";
import type { Integration } from "@/shared/types/integration/integration";

vi.mock("@/shared/store/integrationsApi", () => ({
  useGetIntegrationsQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

import { useGetIntegrationsQuery } from "@/shared/store/integrationsApi";

const mockNeedsReauth: Integration = {
  provider: "gmail",
  connected: true,
  last_synced_at: null,
  metadata: null,
  needs_reauth: true,
};

const mockHealthy: Integration = {
  provider: "gmail",
  connected: true,
  last_synced_at: "2024-03-15T10:00:00Z",
  metadata: null,
  needs_reauth: false,
};

function renderBanner() {
  return render(
    <BrowserRouter>
      <GmailReauthSidebarBanner />
    </BrowserRouter>,
  );
}

describe("GmailReauthSidebarBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while integrations are loading", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [],
      isLoading: true,
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no Gmail integration exists", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when Gmail is connected and healthy", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockHealthy],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("renders the banner when needs_reauth is true", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockNeedsReauth],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderBanner();
    expect(screen.getByTestId("gmail-reauth-sidebar-banner")).toBeInTheDocument();
    expect(screen.getByText(/Gmail reconnection needed/i)).toBeInTheDocument();
  });

  it("has role=alert on the banner for screen readers", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockNeedsReauth],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderBanner();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("links to /integrations from the banner", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [mockNeedsReauth],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    renderBanner();
    const link = screen.getByTestId("gmail-reauth-sidebar-banner-link");
    expect(link).toHaveAttribute("href", "/integrations");
    expect(link).toHaveTextContent(/Reconnect now/i);
  });

  it("ignores a non-gmail provider with needs_reauth=true", () => {
    vi.mocked(useGetIntegrationsQuery).mockReturnValue({
      data: [{ ...mockNeedsReauth, provider: "plaid" }],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetIntegrationsQuery>);
    const { container } = renderBanner();
    // The banner only checks for gmail; a plaid provider should not trigger it.
    expect(container.firstChild).toBeNull();
  });
});
