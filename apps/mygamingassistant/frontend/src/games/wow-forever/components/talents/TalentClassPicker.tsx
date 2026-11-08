import ClassLinkPicker from "@/games/wow-forever/components/shared/ClassLinkPicker";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { TALENTS_PATH } from "@/games/wow-forever/data/talents/talentConfig";

/** The calculator's class links. */
export default function TalentClassPicker({ current }: { current: WowClassId | null }) {
  return <ClassLinkPicker basePath={TALENTS_PATH} current={current} testId="talent-class-picker" />;
}
