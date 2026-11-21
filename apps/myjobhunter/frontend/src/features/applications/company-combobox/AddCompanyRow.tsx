import { Plus } from "lucide-react";

interface AddCompanyRowProps {
  id: string;
  name: string;
  highlighted: boolean;
  disabled: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function stateClassFor(highlighted: boolean, disabled: boolean): string {
  if (disabled) return "text-muted-foreground cursor-not-allowed";
  if (highlighted) return "bg-muted cursor-pointer";
  return "hover:bg-muted/60 cursor-pointer";
}

export default function AddCompanyRow({
  id,
  name,
  highlighted,
  disabled,
  onClick,
  onMouseEnter,
}: AddCompanyRowProps) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={highlighted}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      className={`flex items-center gap-2 px-3 py-2 text-sm ${stateClassFor(highlighted, disabled)}`}
    >
      <Plus size={14} className="shrink-0" />
      <span className="truncate">
        Add <span className="font-medium">{name}</span>
      </span>
    </li>
  );
}
