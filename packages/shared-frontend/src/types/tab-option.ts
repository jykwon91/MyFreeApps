export interface TabOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  testId?: string;
}
