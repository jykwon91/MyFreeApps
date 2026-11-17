import { Link } from "react-router-dom";

export interface RentalRoiEmptyStateProps {
  message: string;
  actionLabel: string;
  to: string;
}

export default function RentalRoiEmptyState({ message, actionLabel, to }: RentalRoiEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <p className="text-muted-foreground max-w-sm">{message}</p>
      <Link
        to={to}
        className="inline-flex min-h-[44px] items-center px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
