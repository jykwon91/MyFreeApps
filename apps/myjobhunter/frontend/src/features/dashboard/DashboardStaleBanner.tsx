import { AlertBox } from "@platform/ui";
import { DASHBOARD_MESSAGES as MESSAGES } from "@/constants/dashboard-messages";

/** Shown above a board whose refresh failed, so old cards aren't mistaken for current ones. */
export default function DashboardStaleBanner() {
  return (
    <div role="status" className="mb-4">
      <AlertBox variant="warning">{MESSAGES.staleBoard}</AlertBox>
    </div>
  );
}
