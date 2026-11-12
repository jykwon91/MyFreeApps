import { STEP_INSTRUCTION_MAX_LENGTH } from "@myrecipes/api-client/constants/recipeForm";
import type { EditableStepRow } from "@myrecipes/api-client/types/recipe/editable-step-row";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FormField, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MULTILINE_MIN_HEIGHT, NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import RowControls from "./RowControls";

interface StepRowEditorProps {
  row: EditableStepRow;
  number: number;
  isLast: boolean;
  isNew: boolean;
  disabled: boolean;
  problem: string | undefined;
  onChange: (key: string, instruction: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
}

/** One numbered step. Its number is its place in the list, as the backend orders steps. */
export default function StepRowEditor({ row, number, isLast, isNew, disabled, problem, onChange, onMove, onRemove }: StepRowEditorProps) {
  const { spacing } = useTheme();
  const label = MESSAGES.stepLabel(number);

  return (
    <View style={{ gap: spacing.xs }} testID={`step-${number}`}>
      <FormField
        autoFocus={isNew}
        counter={characterCounter(row.instruction.trim(), STEP_INSTRUCTION_MAX_LENGTH)}
        editable={!disabled}
        error={problem}
        inputStyle={{ minHeight: MULTILINE_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
        label={label}
        multiline
        onChangeText={(instruction) => onChange(row.key, instruction)}
        placeholder={MESSAGES.stepPlaceholder}
        value={row.instruction}
      />
      <RowControls
        disabled={disabled}
        isFirst={number === 1}
        isLast={isLast}
        name={label.toLowerCase()}
        onMove={(direction) => onMove(row.key, direction)}
        onRemove={() => onRemove(row.key)}
      />
    </View>
  );
}
