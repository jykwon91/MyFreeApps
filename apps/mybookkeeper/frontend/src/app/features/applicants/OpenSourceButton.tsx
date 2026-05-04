import { FileText } from "lucide-react";

export interface OpenSourceButtonProps {
  onClick: () => void;
}

export default function OpenSourceButton({ onClick }: OpenSourceButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-primary shrink-0"
      title="Open source document"
      aria-label="Open source document"
    >
      <FileText className="h-3.5 w-3.5" />
    </button>
  );
}
