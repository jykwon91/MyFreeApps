import { useToast } from "@platform/mobile";
import { useRef, useState, type ComponentRef } from "react";
import type { TextInput } from "react-native";
import { REPLY_TEMPLATE_FIELD_MAX_LENGTH, REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import type { ReplyTemplateField } from "../../types/ReplyTemplateField";
import type { ReplyTemplateFieldProps } from "../../types/ReplyTemplateFieldProps";
import type { ReplyTemplateFormValues } from "../../types/ReplyTemplateFormValues";
import type { TextSelection } from "../../types/TextSelection";
import { insertAtCursor } from "./replyTemplateFormValues";

/** Adds a variable at the cursor of whichever of Subject and Message was used last. */
export function useVariableInsertion(values: ReplyTemplateFormValues, change: (field: ReplyTemplateField, text: string) => void) {
  const { showToast } = useToast();
  const [activeField, setActiveField] = useState<ReplyTemplateField>("body");
  // Set once after an insert, and let go of on the next move, or the cursor would stick.
  const [placed, setPlaced] = useState<{ field: ReplyTemplateField; selection: TextSelection } | null>(null);
  const selections = useRef<Record<ReplyTemplateField, TextSelection | null>>({ subject: null, body: null });
  const subjectInput = useRef<ComponentRef<typeof TextInput>>(null);
  const bodyInput = useRef<ComponentRef<typeof TextInput>>(null);
  const inputs = { subject: subjectInput, body: bodyInput };

  function fieldProps(field: ReplyTemplateField): ReplyTemplateFieldProps {
    return {
      ref: inputs[field],
      onFocus: () => setActiveField(field),
      onSelectionChange: (event) => {
        selections.current[field] = event.nativeEvent.selection;
        if (placed?.field === field) setPlaced(null);
      },
      selection: placed?.field === field ? placed.selection : undefined,
    };
  }

  function insert(token: string): void {
    const text = values[activeField];
    const selection = selections.current[activeField] ?? { start: text.length, end: text.length };
    const result = insertAtCursor(text, selection, token, REPLY_TEMPLATE_FIELD_MAX_LENGTH[activeField]);
    if (!result) {
      showToast(REPLY_TEMPLATE_MESSAGES.tooLong);
      return;
    }
    const cursor = { start: result.cursor, end: result.cursor };
    change(activeField, result.text);
    selections.current[activeField] = cursor;
    setPlaced({ field: activeField, selection: cursor });
    inputs[activeField].current?.focus();
  }

  return { activeField, fieldProps, focus: (field: ReplyTemplateField) => inputs[field].current?.focus(), insert };
}
