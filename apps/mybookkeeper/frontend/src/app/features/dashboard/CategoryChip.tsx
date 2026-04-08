import { cn } from "@/shared/utils/cn";
import { formatTag } from "@/shared/utils/tag";
import { TAG_COLORS } from "@/shared/lib/constants";

interface CategoryChipProps {
  category: string;
  selected: boolean;
  allSelected: boolean;
  onToggle: (category: string) => void;
  onSelectOnly: (category: string) => void;
}

export default function CategoryChip({
  category,
  selected,
  allSelected,
  onToggle,
  onSelectOnly,
}: CategoryChipProps) {
  const color = TAG_COLORS[category] ?? "#94a3b8";

  function handleClick() {
    if (allSelected) {
      onSelectOnly(category);
    } else {
      onToggle(category);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
        "border min-h-[36px] sm:min-h-[32px]",
        selected
          ? "border-transparent text-white shadow-sm"
          : "border-border text-muted-foreground bg-muted/50 hover:bg-muted",
      )}
      style={selected ? { backgroundColor: color } : undefined}
      aria-pressed={selected}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          !selected && "opacity-50",
        )}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {formatTag(category)}
    </button>
  );
}
