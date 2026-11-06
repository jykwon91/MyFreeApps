import { removeMemberLabel } from "@/shared/lib/organization-messages";

interface MemberRowActionProps {
  isSelf: boolean;
  canManage: boolean;
  name: string;
  onRemove: () => void;
}

export default function MemberRowAction({ isSelf, canManage, name, onRemove }: MemberRowActionProps) {
  if (isSelf) return <span className="text-xs text-muted-foreground">You</span>;
  if (!canManage) return null;
  return (
    <button
      onClick={onRemove}
      aria-label={removeMemberLabel(name)}
      className="min-h-[44px] px-2 text-xs text-destructive hover:underline"
    >
      Remove
    </button>
  );
}
