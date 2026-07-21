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
import type { WelcomeManualSectionFieldResponse } from "@/shared/types/welcome-manual/welcome-manual-section-field-response";
import type { WelcomeManualSectionImageResponse } from "@/shared/types/welcome-manual/welcome-manual-section-image-response";

function makeField(
  overrides: Partial<WelcomeManualSectionFieldResponse> = {},
): WelcomeManualSectionFieldResponse {
  return {
    id: "fld-1",
    section_id: "sec-1",
    label: "Wi-Fi network",
    value: "Lakeview",
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

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
    fields: [],
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
        places={[]}
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
      <WelcomeManualPreview title="Guide" introText={null} sections={[]} places={[]} />,
    );
    expect(screen.getByTestId("welcome-manual-preview-empty")).toBeInTheDocument();
  });

  it("renders each section's title and body markdown", () => {
    render(
      <WelcomeManualPreview
        title="Guide"
        introText={null}
        sections={[makeSection()]}
        places={[]}
      />,
    );
    const section = screen.getByTestId("welcome-manual-preview-section");
    expect(within(section).getByRole("heading", { name: "Parking" })).toBeInTheDocument();
    expect(within(section).getByText("spot 4")).toBeInTheDocument();
  });

  it("renders section fields as label/value pairs", () => {
    render(
      <WelcomeManualPreview
        title="Guide"
        introText={null}
        sections={[
          makeSection({
            fields: [
              makeField({ id: "fld-1", label: "Wi-Fi network", value: "Lakeview" }),
              makeField({ id: "fld-2", label: "Check-out", value: "11am" }),
            ],
          }),
        ]}
        places={[]}
      />,
    );
    const rows = screen.getAllByTestId("welcome-manual-preview-field");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Wi-Fi network")).toBeInTheDocument();
    expect(screen.getByText("Lakeview")).toBeInTheDocument();
    expect(screen.getByText("Check-out")).toBeInTheDocument();
    expect(screen.getByText("11am")).toBeInTheDocument();
  });

  it("skips a field row where both label and value are empty", () => {
    render(
      <WelcomeManualPreview
        title="Guide"
        introText={null}
        sections={[
          makeSection({
            fields: [
              makeField({ id: "fld-1", label: "Wi-Fi network", value: "Lakeview" }),
              makeField({ id: "fld-2", label: "", value: null }),
            ],
          }),
        ]}
        places={[]}
      />,
    );
    // Only the populated row renders; the all-empty row is dropped.
    expect(screen.getAllByTestId("welcome-manual-preview-field")).toHaveLength(1);
    expect(screen.getByText("Wi-Fi network")).toBeInTheDocument();
  });

  it("renders section images with their captions", () => {
    render(
      <WelcomeManualPreview
        title="Guide"
        introText={null}
        sections={[makeSection({ images: [makeImage()] })]}
        places={[]}
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
        places={[]}
      />,
    );
    expect(
      screen.getByTestId("welcome-manual-preview-image-missing"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("welcome-manual-preview-image")).not.toBeInTheDocument();
  });
});
