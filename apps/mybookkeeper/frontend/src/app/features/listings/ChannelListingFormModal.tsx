import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Button from "@/shared/components/ui/Button";
import CopyField from "@/shared/components/ui/CopyField";
import FormField from "@/shared/components/ui/FormField";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useCreateListingChannelMutation,
  useUpdateChannelListingMutation,
} from "@/shared/store/listingsApi";
import type { Channel } from "@/shared/types/listing/channel";
import type { ChannelListing } from "@/shared/types/listing/channel-listing";

export interface ChannelListingFormModalProps {
  open: boolean;
  listingId: string;
  /** Available channels (already filtered to exclude already-linked ones in create mode). */
  availableChannels: readonly Channel[];
  /** When undefined, the modal is in create mode. */
  existing?: ChannelListing;
  onClose: () => void;
}

interface ApiError {
  data?: { detail?: string };
}

/**
 * Add / edit modal for a channel_listing.
 *
 * Create mode:
 *   - Channel dropdown (from /channels, excluding already-linked)
 *   - External URL (required)
 *   - External ID (optional)
 *   - iCal Import URL (optional)
 * Edit mode:
 *   - Channel dropdown disabled (immutable post-create)
 *   - All other fields editable
 *   - The outbound iCal URL is shown via CopyField for easy paste
 *
 * Conflict 409 responses surface as toast; the modal stays open so the
 * operator can correct input.
 */
export default function ChannelListingFormModal({
  open,
  listingId,
  availableChannels,
  existing,
  onClose,
}: ChannelListingFormModalProps) {
  const isEdit = existing !== undefined;
  const initialChannelId = existing?.channel_id ?? availableChannels[0]?.id ?? "";

  const [channelId, setChannelId] = useState<string>(initialChannelId);
  const [externalUrl, setExternalUrl] = useState<string>(existing?.external_url ?? "");
  const [externalId, setExternalId] = useState<string>(existing?.external_id ?? "");
  const [icalImportUrl, setIcalImportUrl] = useState<string>(
    existing?.ical_import_url ?? "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedChannel = isEdit
    ? existing?.channel
    : availableChannels.find((c) => c.id === channelId);
  const channelSupportsImport = selectedChannel?.supports_ical_import ?? true;
  const channelSupportsExport = selectedChannel?.supports_ical_export ?? true;

  const [createChannel, { isLoading: isCreating }] = useCreateListingChannelMutation();
  const [updateChannel, { isLoading: isUpdating }] = useUpdateChannelListingMutation();

  const isSubmitting = isCreating || isUpdating;

  // For create mode: if there are no available channels, surface that
  // immediately. We disable the submit button and show a message.
  const noChannelsAvailable = !isEdit && availableChannels.length === 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmedExternalUrl = externalUrl.trim();
    if (trimmedExternalUrl === "") {
      setValidationError("Channel URL is required — that's the link to your listing on the channel.");
      return;
    }
    setValidationError(null);

    const trimmedExternalId = externalId.trim();
    const trimmedIcalUrl = icalImportUrl.trim();

    try {
      if (isEdit && existing) {
        await updateChannel({
          listingId,
          channelListingId: existing.id,
          data: {
            external_url: trimmedExternalUrl,
            external_id: trimmedExternalId === "" ? null : trimmedExternalId,
            ical_import_url: trimmedIcalUrl === "" ? null : trimmedIcalUrl,
          },
        }).unwrap();
        showSuccess("Channel link updated.");
      } else {
        await createChannel({
          listingId,
          data: {
            channel_id: channelId,
            external_url: trimmedExternalUrl,
            external_id: trimmedExternalId === "" ? null : trimmedExternalId,
            ical_import_url: trimmedIcalUrl === "" ? null : trimmedIcalUrl,
          },
        }).unwrap();
        showSuccess("Channel added. Copy the outbound iCal URL into the channel's import-calendar field next.");
      }
      onClose();
    } catch (err) {
      const detail = (err as ApiError)?.data?.detail;
      const message = typeof detail === "string"
        ? detail
        : "I couldn't save that channel link. Want me to try again?";
      showError(message);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content
          data-testid="channel-listing-form-modal"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        >
          <Dialog.Title className="text-base font-semibold">
            {isEdit ? "Edit channel link" : "Add a channel"}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-2">
            {isEdit
              ? "Update the listing URL and optional inbound iCal feed for this channel."
              : "Connect this listing to a booking channel. MBK will sync calendars in both directions."}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <FormField label="Channel" required>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={isEdit || noChannelsAvailable}
                data-testid="channel-listing-form-channel"
                className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm disabled:bg-muted disabled:text-muted-foreground"
              >
                {isEdit && existing ? (
                  <option value={existing.channel_id}>
                    {existing.channel?.name ?? existing.channel_id}
                  </option>
                ) : (
                  availableChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
              {noChannelsAvailable ? (
                <p className="text-xs text-muted-foreground mt-1">
                  All channels are already linked to this listing.
                </p>
              ) : null}
            </FormField>

            <FormField label="Listing URL on the channel" required>
              <input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://..."
                maxLength={500}
                data-testid="channel-listing-form-external-url"
                className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm"
              />
            </FormField>

            <FormField label="External listing ID (optional)">
              <input
                type="text"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="e.g. 12345 or AB-123"
                maxLength={120}
                data-testid="channel-listing-form-external-id"
                className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm"
              />
            </FormField>

            {channelSupportsImport ? (
              <FormField label="Channel's calendar export URL (optional)">
                <input
                  type="url"
                  value={icalImportUrl}
                  onChange={(e) => setIcalImportUrl(e.target.value)}
                  placeholder="https://.../calendar.ics"
                  maxLength={1000}
                  data-testid="channel-listing-form-ical-import-url"
                  className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Paste the channel's iCal export URL here so bookings on that
                  channel come back into MBK every 15 minutes.
                </p>
              </FormField>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                {selectedChannel?.name ?? "This channel"} doesn't expose a
                calendar feed, so MBK can only store the listing link —
                bookings won't sync automatically.
              </p>
            )}

            {isEdit && existing && channelSupportsExport ? (
              <div className="space-y-1">
                <p className="text-xs font-medium">
                  Outbound iCal URL — paste this into the channel's import-calendar field:
                </p>
                <CopyField label="Outbound iCal URL" value={existing.ical_export_url} />
              </div>
            ) : null}

            {validationError ? (
              <p
                role="alert"
                data-testid="channel-listing-form-validation-error"
                className="text-xs text-red-600"
              >
                {validationError}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onClose}
                disabled={isSubmitting}
                data-testid="channel-listing-form-cancel"
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSubmitting}
                loadingText={isEdit ? "Saving..." : "Adding..."}
                disabled={noChannelsAvailable}
                data-testid="channel-listing-form-submit"
              >
                {isEdit ? "Save" : "Add channel"}
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
