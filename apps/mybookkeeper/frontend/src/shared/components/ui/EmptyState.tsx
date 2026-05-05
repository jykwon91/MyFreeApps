export interface EmptyStateProps {
  message: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="text-center text-muted-foreground text-sm py-8">
      <p>{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
