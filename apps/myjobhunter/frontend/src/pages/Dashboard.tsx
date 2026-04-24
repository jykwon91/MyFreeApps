import { useNavigate } from "react-router-dom";
import { Briefcase } from "lucide-react";
import { EmptyState } from "@platform/ui";
import DashboardSkeleton from "@/features/dashboard/DashboardSkeleton";
import { EMPTY_STATES } from "@/constants/empty-states";
import { showSuccess } from "@platform/ui";

// Phase 1: no data yet — simulate instant load then show empty state
const IS_LOADING = false;

export default function Dashboard() {
  const navigate = useNavigate();
  const copy = EMPTY_STATES.dashboard;

  if (IS_LOADING) {
    return <DashboardSkeleton />;
  }

  function handleAddApplication() {
    showSuccess("Application tracking coming in Phase 2!");
    navigate("/applications");
  }

  return (
    <div className="p-6">
      <EmptyState
        icon={<Briefcase className="w-12 h-12" />}
        heading={copy.heading}
        body={copy.body}
        action={{ label: copy.actionLabel, onClick: handleAddApplication }}
      />
    </div>
  );
}
