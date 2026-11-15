/**
 * A guild member's main talent spec from their `talents` list.
 *
 * `talents` comes from the backend's `active_tree_points()`: only trees with
 * points, active set only, in Blizzard's order. The main spec is the tree with
 * the most points; a tie keeps the first one in that order.
 */
import type { WowClassId } from "@/games/wow-forever/data/classes";
import talentTreesRaw from "@/games/wow-forever/data/guild/talentTrees.json";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { GuildMemberTalentTree } from "@/games/wow-forever/types/guild/guildMemberTalentTree";
import type { MemberSpec } from "@/games/wow-forever/types/guild/memberSpec";
import type { TalentTreeEntry } from "@/games/wow-forever/types/talents/talentTreeEntry";

const TALENT_TREES: Readonly<Partial<Record<string, readonly TalentTreeEntry[]>>> = talentTreesRaw;

/** The member's main spec, or null when talents are unknown/empty or the class has no tree data. */
export function resolveSpec(
  classId: WowClassId | string | null | undefined,
  talents: readonly GuildMemberTalentTree[] | null | undefined,
): MemberSpec | null {
  if (!classId || !talents || talents.length === 0) return null;
  const trees = TALENT_TREES[classId];
  if (!trees) return null;
  const best = talents.reduce((top, t) => (t.points > top.points ? t : top));
  const tree = trees.find((tr) => tr.id === best.tree_id);
  if (!tree) return null;
  return { name: tree.name, icon: fileIcon(tree.icon), points: best.points };
}
