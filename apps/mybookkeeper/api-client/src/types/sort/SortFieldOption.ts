/** A column a list can be ordered by, with the name it's shown under. */
export interface SortFieldOption<Field extends string> {
  value: Field;
  label: string;
}
