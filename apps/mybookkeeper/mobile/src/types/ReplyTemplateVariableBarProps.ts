import type { ReplyTemplateField } from "./ReplyTemplateField";

export interface ReplyTemplateVariableBarProps {
  field: ReplyTemplateField;
  onInsert: (token: string) => void;
  /** Off while saving, so what's kept on a failed save is what was sent. */
  disabled: boolean;
}
