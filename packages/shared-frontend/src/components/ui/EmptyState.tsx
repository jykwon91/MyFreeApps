import type { ReactNode } from "react";
import LoadingButton from "./LoadingButton";

interface LegacyProps {
  message: string;
  action?: { label: string; onClick: () => void };
}

interface RichProps {
  icon?: ReactNode;
  heading: string;
  body: string;
  action?: { label: string; onClick: () => void; loading?: boolean };
}

type Props = LegacyProps | RichProps;

function isRichProps(props: Props): props is RichProps {
  return "heading" in props;
}

export default function EmptyState(props: Props) {
  if (isRichProps(props)) {
    const { icon, heading, body, action } = props;
    return (
      <div className="flex flex-col items-center text-center py-12 gap-3">
        {icon && (
          <div className="text-muted-foreground w-12 h-12 flex items-center justify-center">
            {icon}
          </div>
        )}
        <h3 className="text-lg font-semibold">{heading}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{body}</p>
        {action && (
          <LoadingButton
            variant="primary"
            isLoading={action.loading}
            onClick={action.onClick}
          >
            {action.label}
          </LoadingButton>
        )}
      </div>
    );
  }

  const { message, action } = props;
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
