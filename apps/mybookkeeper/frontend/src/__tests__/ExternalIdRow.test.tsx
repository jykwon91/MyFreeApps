import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExternalIdRow from "@/app/features/listings/ExternalIdRow";
import type { ListingExternalId } from "@/shared/types/listing/listing-external-id";

const baseExternalId: ListingExternalId = {
  id: "ext-1",
  listing_id: "listing-1",
  source: "FF",
  external_id: "FF-12345",
  external_url: "https://furnishedfinder.com/property/FF-12345",
  created_at: "2026-01-01T00:00:00Z",
};

describe("ExternalIdRow", () => {
  it("renders the source badge, external ID, and Open link", () => {
    render(
      <ExternalIdRow
        externalId={baseExternalId}
        onEdit={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByTestId("source-badge-FF")).toBeInTheDocument();
    expect(screen.getByText("FF-12345")).toBeInTheDocument();
    const openLink = screen.getByRole("link", { name: /open furnished finder/i });
    expect(openLink).toHaveAttribute("href", baseExternalId.external_url);
    expect(openLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(openLink).toHaveAttribute("target", "_blank");
  });

  it('shows "No ID set" when external_id is null', () => {
    render(
      <ExternalIdRow
        externalId={{ ...baseExternalId, external_id: null }}
        onEdit={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText(/no id set/i)).toBeInTheDocument();
  });

  it("does not render the Open link when external_url is null", () => {
    render(
      <ExternalIdRow
        externalId={{ ...baseExternalId, external_url: null }}
        onEdit={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.queryByRole("link", { name: /open/i })).not.toBeInTheDocument();
  });

  it("calls onEdit when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(
      <ExternalIdRow
        externalId={baseExternalId}
        onEdit={onEdit}
        onRemove={() => {}}
      />,
    );
    await userEvent.setup().click(screen.getByTestId("external-id-edit-ext-1"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("calls onRemove when Remove is clicked", async () => {
    const onRemove = vi.fn();
    render(
      <ExternalIdRow
        externalId={baseExternalId}
        onEdit={() => {}}
        onRemove={onRemove}
      />,
    );
    await userEvent.setup().click(screen.getByTestId("external-id-remove-ext-1"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("disables the Remove button while removing", () => {
    render(
      <ExternalIdRow
        externalId={baseExternalId}
        onEdit={() => {}}
        onRemove={() => {}}
        isRemoving
      />,
    );
    expect(screen.getByTestId("external-id-remove-ext-1")).toBeDisabled();
  });
});
