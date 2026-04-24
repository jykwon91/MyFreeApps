import { FilePlus } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { showSuccess } from "@platform/ui";
import ApplicationsSkeleton from "@/features/applications/ApplicationsSkeleton";
import { EMPTY_STATES } from "@/constants/empty-states";

// Phase 1: no data yet — simulate instant load then show empty state
const IS_LOADING = false;

export default function Applications() {
  const copy = EMPTY_STATES.applications;

  if (IS_LOADING) {
    return (
      <div className="p-6">
        <ApplicationsSkeleton />
      </div>
    );
  }

  function handleAddApplication() {
    console.info("AddApplicationDialog — Phase 2");
    showSuccess("Add application dialog coming in Phase 2!");
  }

  return (
    <div className="p-6">
      <EmptyState
        icon={<FilePlus className="w-12 h-12" />}
        heading={copy.heading}
        body={copy.body}
        action={{ label: copy.actionLabel, onClick: handleAddApplication }}
      />
    </div>
  );
}
