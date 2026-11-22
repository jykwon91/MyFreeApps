import {
  INGREDIENT_NAME_MAX_LENGTH,
  INGREDIENT_NOTE_MAX_LENGTH,
  INGREDIENT_UNIT_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import type { EditableIngredientRow } from "@myrecipes/api-client/types/recipe/editable-ingredient-row";
import type { IngredientRowProblems } from "@myrecipes/api-client/types/recipe/ingredient-row-problems";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { FIELD_PRESETS, type FieldChain, FormField, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../constants/newRecipe";
import type { IngredientFieldKey } from "../../types/IngredientFieldKey";
import { ingredientFieldKey } from "../../utils/ingredientFieldKey";
import RowControls from "./RowControls";

interface IngredientRowEditorProps {
  row: EditableIngredientRow;
  number: number;
  isLast: boolean;
  isNew: boolean;
  disabled: boolean;
  problems: IngredientRowProblems | undefined;
  onChange: (key: string, patch: Partial<EditableIngredientRow>) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
  /** Every ingredient's fields, so Return moves through this row and on to the next. */
  fields: FieldChain<IngredientFieldKey>;
}

/** One ingredient: its name, then amount and unit side by side, a note, and its controls. */
export default function IngredientRowEditor({ row, number, isLast, isNew, disabled, problems, onChange, onMove, onRemove, fields }: IngredientRowEditorProps) {
  const { colors, spacing, radius } = useTheme();
  const label = MESSAGES.ingredientLabel(number);

  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`ingredient-${number}`}
    >
      <FormField
        {...fields.field(ingredientFieldKey(row.key, "name"))}
        autoFocus={isNew}
        editable={!disabled}
        error={problems?.name}
        label={label}
        counter={characterCounter(row.name.trim(), INGREDIENT_NAME_MAX_LENGTH)}
        onChangeText={(name) => onChange(row.key, { name })}
        placeholder={MESSAGES.ingredientPlaceholder}
        value={row.name}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <FormField
          {...FIELD_PRESETS.decimal}
          {...fields.field(ingredientFieldKey(row.key, "quantity"))}
          accessibilityLabel={`${label} ${MESSAGES.quantityLabel.toLowerCase()}`}
          editable={!disabled}
          error={problems?.quantity}
          label={MESSAGES.quantityLabel}
          onChangeText={(quantity) => onChange(row.key, { quantity })}
          placeholder={MESSAGES.quantityPlaceholder}
          style={{ flex: 1 }}
          value={row.quantity}
        />
        <FormField
          {...fields.field(ingredientFieldKey(row.key, "unit"))}
          accessibilityLabel={`${label} ${MESSAGES.unitLabel.toLowerCase()}`}
          counter={characterCounter(row.unit.trim(), INGREDIENT_UNIT_MAX_LENGTH)}
          editable={!disabled}
          error={problems?.unit}
          label={MESSAGES.unitLabel}
          onChangeText={(unit) => onChange(row.key, { unit })}
          placeholder={MESSAGES.unitPlaceholder}
          style={{ flex: 1 }}
          value={row.unit}
        />
      </View>
      <FormField
        {...fields.field(ingredientFieldKey(row.key, "note"))}
        accessibilityLabel={`${label} ${MESSAGES.noteLabel.toLowerCase()}`}
        counter={characterCounter(row.note.trim(), INGREDIENT_NOTE_MAX_LENGTH)}
        editable={!disabled}
        error={problems?.note}
        label={MESSAGES.noteLabel}
        onChangeText={(note) => onChange(row.key, { note })}
        placeholder={MESSAGES.notePlaceholder}
        value={row.note}
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
