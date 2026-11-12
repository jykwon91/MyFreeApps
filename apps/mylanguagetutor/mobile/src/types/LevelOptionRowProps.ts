import type { LevelOption } from "@mylanguagetutor/api-client/types/tutor/level-option";

export interface LevelOptionRowProps {
  option: LevelOption;
  isSelected: boolean;
  onPress: () => void;
}
