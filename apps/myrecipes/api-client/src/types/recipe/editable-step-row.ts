/** A step row as it is being typed into the recipe editor. `key` is client-only and never sent. */
export interface EditableStepRow {
  key: string;
  instruction: string;
}
