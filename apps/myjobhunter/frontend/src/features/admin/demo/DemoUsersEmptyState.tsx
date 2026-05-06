import { Sparkles } from "lucide-react";
import { EmptyState } from "@platform/ui";

interface DemoUsersEmptyStateProps {
  onCreate: () => void;
}

/**
 * Empty state shown on the demo-users admin page when zero demo
 * accounts exist. Wraps `@platform/ui`'s `EmptyState` with copy
 * tailored to the operator audience.
 */
export default function DemoUsersEmptyState({
  onCreate,
}: DemoUsersEmptyStateProps) {
  return (
    <EmptyState
      icon={<Sparkles className="w-12 h-12" />}
      heading="No demo accounts yet"
      body="Create one to showcase MyJobHunter with realistic seeded data."
      action={{ label: "Create demo account", onClick: onCreate }}
    />
  );
}
