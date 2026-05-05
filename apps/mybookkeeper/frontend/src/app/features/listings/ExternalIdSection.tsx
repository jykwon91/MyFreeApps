import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  LISTING_SOURCES,
  LISTING_SOURCE_LABELS,
} from "@/shared/lib/listing-labels";
import { useDeleteListingExternalIdMutation } from "@/shared/store/listingsApi";
import type { ListingExternalId } from "@/shared/types/listing/listing-external-id";
import type { ListingSource } from "@/shared/types/listing/listing-source";
import ExternalIdForm from "./ExternalIdForm";
import ExternalIdRow from "./ExternalIdRow";

export interface ExternalIdSectionProps {
  listingId: string;
  externalIds: readonly ListingExternalId[];
}

type FormMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; externalId: ListingExternalId };

/**
 * Editable "External listings" section on the listing detail page.
 *
 * Renders existing linkages as rows, supports add / edit / remove. Per
 * RENTALS_PLAN §5.1 + §9.2:
 *   - SourceBadge (color + icon, never color alone)
 *   - "Add link" button hidden when every source is already linked
 *   - Empty state with prominent CTA
 *   - Toasts for success / failure (no alert(), no modal popups for ops)
 */
export default function ExternalIdSection({ listingId, externalIds }: ExternalIdSectionProps) {
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleteExternalId] = useDeleteListingExternalIdMutation();

  const linkedSources: readonly ListingSource[] = externalIds.map(
    (e) => e.source,
  );
  const allSourcesLinked = linkedSources.length === LISTING_SOURCES.length;

  function handleAdd() {
    setFormMode({ kind: "create" });
  }

  function handleEdit(externalId: ListingExternalId) {
    setFormMode({ kind: "edit", externalId });
  }

  function handleFormClose() {
    setFormMode({ kind: "closed" });
  }

  async function handleRemove(externalId: ListingExternalId) {
    setRemovingId(externalId.id);
    try {
      await deleteExternalId({
        listingId,
        externalIdPk: externalId.id,
      }).unwrap();
      showSuccess(`${LISTING_SOURCE_LABELS[externalId.source]} link removed.`);
      // If the form was open in edit mode for this row, close it.
      if (formMode.kind === "edit" && formMode.externalId.id === externalId.id) {
        setFormMode({ kind: "closed" });
      }
    } catch {
      showError("I couldn't remove that link. Want me to try again?");
    } finally {
      setRemovingId(null);
    }
  }

  const showAddButton =
    formMode.kind !== "create" && !allSourcesLinked;

  return (
    <div className="space-y-3" data-testid="external-id-section">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Pair this listing with the matching ID on each platform so future
          inquiries can be linked back automatically.
        </div>
        {showAddButton ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            data-testid="external-id-add-button"
          >
            <Plus className="h-3 w-3 mr-1" aria-hidden="true" />
            Add link
          </Button>
        ) : null}
      </div>

      {externalIds.length === 0 && formMode.kind === "closed" ? (
        <div
          data-testid="external-id-empty-state"
          className="border-2 border-dashed rounded-lg p-6 text-center space-y-3"
        >
          <p className="text-sm text-muted-foreground">
            Not linked to any listing platform yet.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={handleAdd}
            data-testid="external-id-add-cta"
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            Add your first link
          </Button>
        </div>
      ) : null}

      {externalIds.length > 0 ? (
        <ul className="space-y-2" data-testid="external-id-list">
          {externalIds.map((ext) => (
            <ExternalIdRow
              key={ext.id}
              externalId={ext}
              onEdit={() => handleEdit(ext)}
              onRemove={() => handleRemove(ext)}
              isRemoving={removingId === ext.id}
            />
          ))}
        </ul>
      ) : null}

      {formMode.kind === "create" ? (
        <ExternalIdForm
          listingId={listingId}
          linkedSources={linkedSources}
          onSuccess={handleFormClose}
          onCancel={handleFormClose}
        />
      ) : null}

      {formMode.kind === "edit" ? (
        <ExternalIdForm
          listingId={listingId}
          existing={formMode.externalId}
          linkedSources={linkedSources}
          onSuccess={handleFormClose}
          onCancel={handleFormClose}
        />
      ) : null}
    </div>
  );
}
