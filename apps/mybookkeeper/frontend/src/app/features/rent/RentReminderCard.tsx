import { useState } from "react";
import { AlertBox, Button } from "@platform/ui";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { useGetRentReminderOverviewQuery } from "@/shared/store/rentRemindersApi";
import { describePlan } from "./rent-reminder-format";
import RentReminderForm from "./RentReminderForm";
import RentReminderHistory from "./RentReminderHistory";
import RentReminderPreviewBox from "./RentReminderPreviewBox";
import RentReminderSkeleton from "./RentReminderSkeleton";

export interface RentReminderCardProps {
  applicantId: string;
}

/**
 * Rent reminders for one tenant: a heads-up before rent is due, by email
 * and/or a text from the host's own phone.
 *
 * Reminders only — nothing here knows whether rent was paid. The amount quoted
 * comes from the rent schedule above (split across pay days for a weekly
 * payer), so the card is only meaningful once a schedule exists.
 */
export default function RentReminderCard({ applicantId }: RentReminderCardProps) {
  const canWrite = useCanWrite();
  const [editing, setEditing] = useState(false);
  const { data: overview, isLoading, isError, refetch } =
    useGetRentReminderOverviewQuery(applicantId);

  if (isLoading) return <RentReminderSkeleton />;

  if (isError || !overview) {
    return (
      <AlertBox variant="error" className="flex items-center justify-between gap-3">
        <span>Couldn&apos;t load rent reminders.</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
          data-testid="rent-reminder-retry"
        >
          Retry
        </Button>
      </AlertBox>
    );
  }

  const { plan } = overview;

  if (editing) {
    return (
      <RentReminderForm
        applicantId={applicantId}
        overview={overview}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  if (!plan) {
    return (
      <div className="space-y-3" data-testid="rent-reminder-empty">
        <p className="text-sm text-muted-foreground">
          Send this tenant a friendly heads-up before rent is due — by email, or
          by text from your own phone.
        </p>
        {canWrite ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setEditing(true)}
            className="min-h-[44px]"
            data-testid="rent-reminder-setup"
          >
            Set up reminders
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="rent-reminder-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm" data-testid="rent-reminder-summary">
          {describePlan(plan)}
        </p>
        {canWrite ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
            className="min-h-[44px] shrink-0"
            data-testid="rent-reminder-edit"
          >
            Edit
          </Button>
        ) : null}
      </div>

      <RentReminderPreviewBox applicantId={applicantId} plan={plan} canWrite={canWrite} />

      <div className="space-y-1">
        <h3 className="text-sm font-medium">History</h3>
        <RentReminderHistory applicantId={applicantId} />
      </div>
    </div>
  );
}
