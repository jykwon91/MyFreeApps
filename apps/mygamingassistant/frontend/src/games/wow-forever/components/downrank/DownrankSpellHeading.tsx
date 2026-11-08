import { Link } from "react-router-dom";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { DOWNRANK_TARGET_NOTE } from "@/games/wow-forever/data/downrank/downrankLabels";
import { writeChangeFilters } from "@/games/wow-forever/lib/changes/changeFilterParams";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";

interface DownrankSpellHeadingProps {
  family: DownrankFamily;
}

function changesHref(family: DownrankFamily): string {
  const params = writeChangeFilters(new URLSearchParams(), {
    category: "spells",
    classId: family.classId,
    query: family.name,
    sinceLastBuild: false,
  });
  return `/wow-forever/changes?${params.toString()}`;
}

/** The spell's icon and name over its ranks, who it lands on, and a link to what Forever changed in it. */
export default function DownrankSpellHeading({ family }: DownrankSpellHeadingProps) {
  const note = DOWNRANK_TARGET_NOTE[family.targets];
  return (
    <div className="space-y-1">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <GameIcon icon={fileIcon(family.icon)} size={32} alt="" />
        {family.name} ranks
      </h2>
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      {family.changedInForever ? (
        <p className="text-sm">
          <Link to={changesHref(family)} className="underline underline-offset-2 inline-flex min-h-[44px] items-center">
            See what Forever changed in {family.name}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
