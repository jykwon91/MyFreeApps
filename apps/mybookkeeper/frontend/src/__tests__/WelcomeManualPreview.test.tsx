/**
 * Unit tests for WelcomeManualPreview — the guest-facing assembled view.
 *
 * Verifies it mirrors the emailed PDF structure: title, intro markdown, then
 * each section's title, body markdown, and images with captions. Also covers
 * the empty-sections placeholder and the missing-image fallback.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import WelcomeManualPreview from "@/app/features/welcome-manuals/WelcomeManualPreview";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";
import type { WelcomeManualSectionImageResponse } from "@/shared/types/welcome-manual/welcome-manual-section-image-response";

function makeImage(
  overrides: Partial<WelcomeManualSectionImageResponse> = {},
): WelcomeManualSectionImageResponse {
  return {
    id: "img-1",
    section_id: "sec-1",
    storage_key: "welcome-manuals/img-1.jpg",
    caption: "Front door",
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    presigned_url: "https://storage.example.com/img-1.jpg",
    is_available: true,
    ...overrides,
  };
}

function makeSection(
  overrides: Partial<WelcomeManualSectionResponse> = {},
): WelcomeManualSectionResponse {
  return {
    id: "sec-1",
    manual_id: "m-1",
    title: "Parking",
    body: "Park in **spot 4**.",
    display_order: 0,
    images: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("WelcomeManualPreview", () => {
  it("renders the title and intro markdown", () => {
    render(
      <WelcomeManualPreview
        title="Lakeview Welcome Guide"
        introText="Welcome to **our home**!"
        sections={[]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Lakeview Welcome Guide" }),
    ).toBeInTheDocument();
    const intro = screen.getByTestId("welcome-manual-preview-intro");
    expect(within(intro).getByText("our home")).toBeInTheDocument();
  });

  it("shows the empty placeholder when there are no sections", () => {
    render(
      <WelcomeManualPreview title="Guide" introText={null} sections={[]} />,
    );
    expect(screen.getByTestId("welcome-manual-preview-empty")).toBeInTheDocument();
  });

  it("renders each section's title and body markdown", () => {
    render(
      <WelcomeManualPreview
        title="Guide"
        introText={null}
        sections={[makeSection()]}
      />,
    );
    const section = screen.getByTestId("welcome-manual-preview-section");
    expect(within(section).getByRole("heading", { name: "Parking" })).toBeInTheDocument();
    expect(within(section).getByText("spot 4")).toBeInTheDocument();
  });

  it("renders section images with their captions", () => {
    render(
      <WelcomeManualPreview
        title="Guide"
        introText={null}
        sections={[makeSection({ images: [makeImage()] })]}
      />,
    );
    const img = screen.getByTestId("welcome-manual-preview-image");
    expect(img).toHaveAttribute("src", "https://storage.example.com/img-1.jpg");
    expect(screen.getByText("Front door")).toBeInTheDocument();
  });

  it("renders a placeholder when an image is unavailable", () => {
    render(
      <WelcomeManualPreview
        title="Guide"
        introText={null}
        sections={[
          makeSection({
            images: [makeImage({ is_available: false, presigned_url: null })],
          }),
        ]}
      />,
    );
    expect(
      screen.getByTestId("welcome-manual-preview-image-missing"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("welcome-manual-preview-image")).not.toBeInTheDocument();
  });
});
