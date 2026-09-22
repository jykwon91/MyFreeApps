import type { ChecklistItem } from "@/games/wow-forever/data/guide/guideTypes";

interface ChecklistRowProps {
  item: ChecklistItem;
  checked: boolean;
  onToggle: (id: string) => void;
}

export default function ChecklistRow({ item, checked, onToggle }: ChecklistRowProps) {
  const inputId = `mistake-${item.id}`;
  return (
    <li className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(item.id)}
        className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
      />
      <label htmlFor={inputId} className="cursor-pointer space-y-0.5">
        <span className={checked ? "block text-sm font-medium line-through text-muted-foreground" : "block text-sm font-medium"}>
          {item.title}
        </span>
        <span className="block text-sm text-muted-foreground">{item.detail}</span>
      </label>
    </li>
  );
}
