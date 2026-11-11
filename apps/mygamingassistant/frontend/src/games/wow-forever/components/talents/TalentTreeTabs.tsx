import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { treePoints } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface TalentTreeTabsProps {
  trees: readonly TalentTree[];
  build: TalentBuild;
  active: number;
  onChange: (tree: number) => void;
}

/** Below `lg` one tree shows at a time: a tab per tree with its points. */
export default function TalentTreeTabs({ trees, build, active, onChange }: TalentTreeTabsProps) {
  const options = trees.map((tree, i) => ({ id: String(i), label: `${tree.name} (${treePoints(build, i)})`, icon: fileIcon(tree.icon) }));
  return (
    <SegmentedToggle
      label="Talent tree"
      options={options}
      value={String(active)}
      onChange={(id) => onChange(Number(id))}
      className="grid w-full grid-cols-3 lg:hidden"
      compact
    />
  );
}
