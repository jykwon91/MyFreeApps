import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import SourceBadge from "@/shared/components/ui/SourceBadge";
import Button from "@/shared/components/ui/Button";
import { LISTING_SOURCE_LABELS } from "@/shared/lib/listing-labels";
import type { ListingExternalId } from "@/shared/types/listing/listing-external-id";

interface Props {
  externalId: ListingExternalId;
  onEdit: () => void;
  onRemove: () => void;
  isRemoving?: boolean;
}

/**
 * Single existing external-ID linkage row.
 *
 * Shows the SourceBadge, the external_id (or muted "No ID set"), an
 * "Open" link icon when external_url is present, and Edit/Remove inline
 * action buttons. Mobile-first: every interactive element is at least
 * 44x44px touch target via the shared Button component.
 */
export default function ExternalIdRow({
  externalId,
  onEdit,
  onRemove,
  isRemoving,
}: Props) {
  const sourceLabel = LISTING_SOURCE_LABELS[externalId.source];
  return (
    <li
      data-testid={`external-id-row-${externalId.id}`}
      className="flex flex-wrap items-center gap-3 text-sm"
    >
      <SourceBadge source={externalId.source} />
      {externalId.external_id ? (
        <span className="text-muted-foreground font-mono text-xs break-all">
          {externalId.external_id}
        </span>
      ) : (
        <span className="text-muted-foreground italic text-xs">No ID set</span>
      )}
      {externalId.external_url ? (
        <a
          href={externalId.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline min-h-[44px] px-1"
          aria-label={`Open ${sourceLabel} listing in new tab`}
        >
          Open
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={onEdit}
          data-testid={`external-id-edit-${externalId.id}`}
          aria-label={`Edit ${sourceLabel} link`}
        >
          <Pencil className="h-3 w-3 mr-1" aria-hidden="true" />
          Edit
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRemove}
          disabled={isRemoving}
          data-testid={`external-id-remove-${externalId.id}`}
          aria-label={`Remove ${sourceLabel} link`}
          className="text-red-600 border-red-200 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />
          Remove
        </Button>
      </div>
    </li>
  );
}
