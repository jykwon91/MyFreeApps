/**
 * Empty state shown when the user has zero non-archived applications.
 * Mirrors the existing dashboard empty-state CTA (Analyze a job).
 */
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { EmptyState } from "@platform/ui";

export default function KanbanEmptyState() {
  const navigate = useNavigate();

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <EmptyState
        icon={<Search className="w-12 h-12" />}
        heading="Your hunt starts here"
        body="Paste a job description on the Analyze page to see how it ranks for you, then add it to your applications."
        action={{
          label: "Analyze a job",
          onClick: () => navigate("/analyze"),
        }}
      />
    </main>
  );
}
