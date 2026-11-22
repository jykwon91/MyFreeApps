/**
 * Empty state shown when the user has zero non-archived applications.
 * Mirrors the existing dashboard empty-state CTA (Analyze a job).
 */
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { EmptyState, StaleDataBanner } from "@platform/ui";
import { DASHBOARD_MESSAGES } from "@/constants/dashboard-messages";

interface KanbanEmptyStateProps {
  /** True when a refresh failed, so the board may not really be empty. */
  isStale?: boolean;
}

export default function KanbanEmptyState({ isStale = false }: KanbanEmptyStateProps) {
  const navigate = useNavigate();

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {isStale ? <StaleDataBanner message={DASHBOARD_MESSAGES.staleBoard} /> : null}
      <EmptyState
        icon={<Search className="w-12 h-12" />}
        heading="Your hunt starts here"
        body="Paste a job description on the Analyze page to see how it ranks for you, then add it to your applications."
        action={{
          label: "Analyze a job",
          onClick: () => navigate("/analyze"),
        }}
      />
    </div>
  );
}
