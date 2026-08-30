import { Button } from "@platform/ui";

export interface RentLedgerEmptyProps {
  canWrite: boolean;
  onSetUp: () => void;
}

/**
 * Shown when no rent schedule exists for this tenant.
 *
 * The copy leads with the case the feature exists for — a tenant paying on a
 * different rhythm than they are billed on — because that is the situation in
 * which a host would not otherwise know a schedule is what they need.
 */
export default function RentLedgerEmpty({
  canWrite,
  onSetUp,
}: RentLedgerEmptyProps) {
  return (
    <div className="space-y-3" data-testid="rent-ledger-empty">
      <p className="text-sm text-muted-foreground">
        No rent set up yet. Record what this tenant owes and how often, and
        every attributed payment gets applied to it automatically — including
        weekly payments against a monthly rent.
      </p>
      {canWrite ? (
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSetUp}
          data-testid="rent-setup-button"
        >
          Set up rent
        </Button>
      ) : null}
    </div>
  );
}
