import { Link } from "react-router-dom";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { CLASSES_PATH } from "@/games/wow-forever/data/classes/classesConfig";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { WowClass } from "@/games/wow-forever/data/classes";
import type { ClassDetail } from "@/games/wow-forever/types/classes/classDetail";

interface ClassCardProps {
  wowClass: WowClass;
  detail: ClassDetail;
}

/** One class tile on the classes index — icon, name, roles. */
export default function ClassCard({ wowClass, detail }: ClassCardProps) {
  const roles = uniqueRoles(wowClass);
  return (
    <Link
      to={`${CLASSES_PATH}/${wowClass.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40 transition-colors min-h-[44px]"
      data-testid={`class-card-${wowClass.id}`}
    >
      <GameIcon icon={fileIcon(detail.icon)} size={32} alt="" />
      <div className="min-w-0">
        <p className="font-medium leading-tight">{wowClass.name}</p>
        <p className="text-xs text-muted-foreground">{roles}</p>
      </div>
    </Link>
  );
}

function uniqueRoles(wowClass: WowClass): string {
  const parts: string[] = [];
  const specRoles = wowClass.specs.map((s) => s.role);
  if (specRoles.includes("healer")) parts.push("Healer");
  if (specRoles.includes("tank")) parts.push("Tank");
  if (specRoles.some((r) => r === "caster" || r === "melee" || r === "ranged")) parts.push("DPS");
  return parts.join(" · ");
}
