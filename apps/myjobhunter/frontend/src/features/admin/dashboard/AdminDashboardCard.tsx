import type { ReactNode } from "react";

interface AdminDashboardCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  chevron: ReactNode;
}

/**
 * Inner content of a single admin-dashboard tile. The wrapping `<Link>`
 * lives in the page so this component stays presentation-only and
 * trivially testable in isolation.
 */
export default function AdminDashboardCard({
  icon,
  title,
  description,
  chevron,
}: AdminDashboardCardProps) {
  return (
    <div className="flex items-start gap-3 w-full">
      <div className="shrink-0 mt-0.5 text-primary">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="shrink-0 self-center">{chevron}</div>
    </div>
  );
}
