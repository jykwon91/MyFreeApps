import { AlertTriangle } from "lucide-react";

interface Props {
  largeDogDisclosure: string | null;
}

/**
 * Prominent yellow banner shown on listing detail when the underlying
 * `Listing.pets_on_premises` is true. Renders the large_dog_disclosure
 * verbatim when present so the host's host-side note (e.g., "Rottweiler on
 * premises — please review before signing") never gets buried.
 *
 * Per RENTALS_PLAN §9.3 the host should never need to remember to mention
 * pets — the banner makes the disclosure the first thing a viewer sees.
 */
export default function PetDisclosureBanner({ largeDogDisclosure }: Props) {
  return (
    <div
      role="note"
      aria-label="Pet disclosure"
      data-testid="pet-disclosure-banner"
      className="border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-950/40 dark:border-yellow-700 rounded-lg p-4 flex items-start gap-3"
    >
      <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-sm text-yellow-900 dark:text-yellow-100 space-y-1">
        <p className="font-medium">Pets on premises</p>
        {largeDogDisclosure && largeDogDisclosure.trim().length > 0 ? (
          <p className="whitespace-pre-line">{largeDogDisclosure}</p>
        ) : (
          <p>The host has indicated that pets live at this property. Confirm comfort with pets before booking.</p>
        )}
      </div>
    </div>
  );
}
